"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { requireUser } from "@/lib/auth";
import { allow } from "@/lib/limiter";
import { MAX_FILE, sealFile, sniffMime, filesEncryptionReady } from "@/lib/health-crypto";

const uuid = z.uuid();
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function readFile(fd: FormData): Promise<{ buf: Buffer; mime: string; name: string } | { error: string }> {
  const f = fd.get("file");
  if (!(f instanceof File) || f.size === 0) return { error: "Choisissez un fichier (PDF ou photo)." };
  if (f.size > MAX_FILE) return { error: "Fichier trop lourd : 10 Mo au maximum." };
  const buf = Buffer.from(await f.arrayBuffer());
  const mime = sniffMime(buf);
  if (!mime) return { error: "Format non accepté : PDF, JPEG, PNG ou WebP uniquement." };
  return { buf, mime, name: f.name.slice(0, 160) };
}

/** Le laboratoire envoie un résultat : chiffré sur le serveur, puis déposé dans un espace privé. */
export async function uploadLabResult(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("/laboratoire/prelevements");
  const req = uuid.safeParse(fd.get("request_id")); const fac = uuid.safeParse(fd.get("facility_id"));
  if (!req.success || !fac.success) return { error: "Demande invalide" };
  if (!filesEncryptionReady()) return { error: "L'envoi de résultats est désactivé : le chiffrement n'est pas configuré sur le serveur." };
  if (!(await allow(`result-up:${s.userId}`, 30, 60 * 60_000))) return { error: "Trop d'envois, réessayez plus tard." };
  const file = await readFile(fd);
  if ("error" in file) return { error: file.error };
  const supabase = await createClient();
  const path = `${fac.data}/${req.data}/${randomUUID()}.bin`;
  const { error: upErr } = await supabase.storage.from("lab-results").upload(path, sealFile(file.buf), { contentType: "application/octet-stream", upsert: false });
  if (upErr) return { error: "Envoi refusé : vérifiez que le patient a accepté de recevoir ses résultats sur SantéProxi." };
  const { error } = await supabase.rpc("lab_add_result", { p_request: req.data, p_path: path, p_name: file.name, p_mime: file.mime, p_size: file.buf.length, p_note: str(fd, "note").slice(0, 500) || null });
  if (error) { await supabase.storage.from("lab-results").remove([path]); return { error: humanizeError(error) }; }
  revalidatePath("/laboratoire/prelevements");
  return { ok: true, message: "Résultat envoyé. Le patient est prévenu." };
}

export async function deleteLabResult(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("/compte/resultats");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Résultat invalide" };
  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc("delete_lab_result", { p_id: id.data });
  if (error) return { error: humanizeError(error) };
  if (path) await supabase.storage.from("lab-results").remove([path as string]);
  revalidatePath("/compte/resultats"); revalidatePath("/laboratoire/prelevements");
  return { ok: true, message: "Résultat supprimé." };
}

/** Document personnel du dossier santé : chiffré, visible par le seul titulaire, jamais lu par une IA. */
export async function uploadRecordDocument(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("/ma-sante/dossier/documents");
  const person = uuid.safeParse(fd.get("person_id"));
  if (!person.success) return { error: "Dossier invalide" };
  const title = str(fd, "title");
  if (title.length < 2) return { error: "Donnez un titre au document.", fieldErrors: { title: "Obligatoire" } };
  if (!filesEncryptionReady()) return { error: "Le rangement de documents est désactivé : le chiffrement n'est pas configuré sur le serveur." };
  if (!(await allow(`doc-up:${s.userId}`, 30, 60 * 60_000))) return { error: "Trop d'envois, réessayez plus tard." };
  const supabase = await createClient();
  const { data: st } = await supabase.rpc("record_status");
  if ((st as { locked?: boolean } | null)?.locked) return { error: "Votre dossier est verrouillé : ouvrez-le avec votre code." };
  const file = await readFile(fd);
  if ("error" in file) return { error: file.error };
  const path = `${s.userId}/${randomUUID()}.bin`;
  const { error: upErr } = await supabase.storage.from("personal-documents").upload(path, sealFile(file.buf), { contentType: "application/octet-stream", upsert: false });
  if (upErr) return { error: "Envoi impossible pour le moment. Réessayez." };
  const kind = ["ordonnance", "resultat", "compte_rendu", "certificat", "vaccination", "autre"].includes(str(fd, "doc_kind")) ? str(fd, "doc_kind") : "autre";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(str(fd, "doc_date")) ? str(fd, "doc_date") : null;
  const { error } = await supabase.from("record_documents").insert({ user_id: s.userId, person_id: person.data, title: title.slice(0, 120), doc_kind: kind, doc_date: date, storage_path: path, mime: file.mime, size_bytes: file.buf.length });
  if (error) { await supabase.storage.from("personal-documents").remove([path]); return { error: humanizeError(error) }; }
  revalidatePath("/ma-sante/dossier/documents");
  return { ok: true, message: "Document rangé dans votre dossier." };
}

export async function deleteRecordDocument(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("/ma-sante/dossier/documents");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Document invalide" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("record_documents").delete().eq("id", id.data).select("storage_path").maybeSingle();
  if (error) return { error: humanizeError(error) };
  if (data?.storage_path) await supabase.storage.from("personal-documents").remove([data.storage_path]);
  revalidatePath("/ma-sante/dossier/documents");
  return { ok: true, message: "Document supprimé." };
}
