"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { setFlash } from "@/lib/flash";
import { checkAudioFile } from "@/lib/audio";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const KEY = /^[a-z0-9:-]{2,100}$/;
function refresh(key?: string) {
  revalidatePath("/", "layout"); // le lecteur apparaît sur plusieurs pages publiques
  revalidatePath("/admin/audio");
  if (key) revalidatePath(`/admin/audio/${encodeURIComponent(key)}`);
}

export async function uploadAudio(_: ActionState, fd: FormData): Promise<ActionState> {
  const target = s(fd, "target");
  const lang = s(fd, "lang");
  if (!KEY.test(target) || !/^[a-z]{2,12}$/.test(lang)) return { error: "Requête invalide" };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choisissez le fichier audio." };
  const check = checkAudioFile(file.name, file.size, file.type);
  if ("error" in check) return { error: check.error };
  const duration = Number(s(fd, "duration")) || null;
  const supabase = await createClient();
  const path = `${target.replace(/:/g, "-")}/${lang}-${randomUUID().slice(0, 8)}.${check.ext}`;
  const { error: upErr } = await supabase.storage.from("audio-guides").upload(path, file, { contentType: check.mime, upsert: false });
  if (upErr) return { error: `Envoi du fichier impossible : ${humanizeError(upErr)}` };
  const { data: old, error } = await supabase.rpc("audio_register_clip", {
    p_target: target, p_lang: lang, p_path: path, p_mime: check.mime, p_size: file.size,
    p_duration: duration && duration > 0 && duration <= 900 ? Math.round(duration) : null,
    p_speaker: s(fd, "speaker") || null, p_translator: s(fd, "translator") || null, p_reviewer: s(fd, "reviewer") || null,
  });
  if (error) {
    await supabase.storage.from("audio-guides").remove([path]);
    return { error: humanizeError(error) };
  }
  if (old) await supabase.storage.from("audio-guides").remove([old as string]);
  refresh(target);
  await setFlash("Enregistrement déposé (brouillon) : écoutez-le, puis publiez-le.");
  return { ok: true, message: "Enregistrement déposé." };
}

export async function publishAudio(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const on = fd.get("publish") === "true";
  const supabase = await createClient();
  const { error } = await supabase.rpc("audio_set_published", { p_id: id.data, p_publish: on });
  if (error) return { error: humanizeError(error) };
  refresh(s(fd, "target"));
  await setFlash(on ? "Enregistrement publié." : "Enregistrement retiré du site.");
  return { ok: true, message: "OK" };
}

export async function deleteAudio(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("audio_delete_clip", { p_id: id.data });
  if (error) return { error: humanizeError(error) };
  if (data) await supabase.storage.from("audio-guides").remove([data as string]);
  refresh(s(fd, "target"));
  await setFlash("Enregistrement supprimé.");
  return { ok: true, message: "Supprimé." };
}

export async function saveAudioTarget(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = s(fd, "article_slug");
  const supabase = await createClient();
  let key = s(fd, "key"), label = s(fd, "label"), path = s(fd, "page_path"), script = s(fd, "script");
  if (slug) {
    const { data: a } = await supabase.from("health_articles").select("slug, title, summary").eq("slug", slug).eq("status", "published").maybeSingle();
    if (!a) return { error: "Fiche publiée introuvable." };
    key = `fiche:${a.slug}`.slice(0, 100); label = `Fiche : ${a.title}`.slice(0, 160); path = `/sante/fiche/${a.slug}`; script = script || a.summary;
  }
  const { error } = await supabase.rpc("audio_save_target", { p_key: key, p_label: label, p_path: path, p_script: script });
  if (error) return { error: humanizeError(error) };
  refresh(key);
  await setFlash("Page ajoutée à la liste des enregistrements.");
  return { ok: true, message: "OK" };
}
