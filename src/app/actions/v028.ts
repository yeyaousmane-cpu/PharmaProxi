"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { allow } from "@/lib/limiter";
import { SHARE_SECTIONS, type ShareView } from "@/lib/passeport";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const uuid = (fd: FormData, k: string) => z.uuid().safeParse(fd.get(k));

async function siteUrl() {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

// ---------------- Passeport santé : partages ----------------
/** Crée un partage. Le lien (et son QR code) n'est montré qu'une fois : seule son empreinte est conservée. */
export async function createShare(_: ActionState, fd: FormData): Promise<ActionState> {
  const person = uuid(fd, "person_id");
  const sections = fd.getAll("sections").map(String).filter((s) => s in SHARE_SECTIONS);
  const hours = Number(str(fd, "hours"));
  if (!person.success) return { error: "Dossier invalide." };
  if (!sections.length) return { error: "Choisissez au moins une information à partager." };
  if (![1, 24, 72, 168, 720].includes(hours)) return { error: "Durée invalide." };
  if (fd.get("accord") !== "on") return { error: "Cochez la case pour confirmer que vous souhaitez partager ces informations." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_health_share", { p_person: person.data, p_sections: sections, p_hours: hours, p_label: str(fd, "label").slice(0, 80) });
  if (error) return { error: humanizeError(error) };
  const r = data as { reference: string; token: string; expires_at: string };
  const url = `${await siteUrl()}/passeport/${r.token}`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 1, width: 240, errorCorrectionLevel: "M" });
  revalidatePath("/ma-sante/dossier/autorisations");
  return { ok: true, message: "Partage créé.", data: { url, qr, reference: r.reference, expires_at: r.expires_at } };
}

export async function revokeShare(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid(fd, "id");
  if (!id.success) return { error: "Partage invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_health_share", { p_id: id.data });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/ma-sante/dossier/autorisations");
  return { ok: true, message: "Partage retiré : le lien ne fonctionne plus." };
}

/** Ouverture d'un partage par la personne qui a reçu le lien. Chaque ouverture est enregistrée. */
export async function openShare(token: string, viewer: string): Promise<ShareView> {
  if (!/^[0-9a-f]{64}$/.test(token)) return { status: "invalide" };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "inconnu";
  if (!(await allow(`passeport:${ip}`, 30, 10 * 60_000))) return { status: "trop" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_health_share", { p_token: token, p_viewer: viewer.trim().slice(0, 80) || null });
  if (error) return { status: "erreur" };
  return data as ShareView;
}

// ---------------- Rappels de mesure ----------------
export async function saveMeasureReminder(_: ActionState, fd: FormData): Promise<ActionState> {
  const kind = z.enum(["tension", "glycemie"]).safeParse(str(fd, "kind"));
  const days = fd.getAll("days").map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  const at = str(fd, "at_time");
  if (!kind.success || !/^([01]\d|2[0-3]):[0-5]\d$/.test(at)) return { error: "Heure invalide." };
  if (!days.length) return { error: "Choisissez au moins un jour." };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Connectez-vous de nouveau." };
  const { error } = await supabase.from("measure_reminders").upsert({ user_id: auth.user.id, kind: kind.data, weekdays: days, at_time: at, active: true }, { onConflict: "user_id,kind" });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/ma-sante/suivi");
  return { ok: true, message: "Rappel enregistré." };
}

export async function deleteMeasureReminder(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid(fd, "id");
  if (!id.success) return { error: "Rappel invalide." };
  const supabase = await createClient();
  const { error } = await supabase.from("measure_reminders").delete().eq("id", id.data);
  if (error) return { error: humanizeError(error) };
  revalidatePath("/ma-sante/suivi");
  return { ok: true, message: "Rappel supprimé." };
}

// ---------------- Suivi par un médecin ----------------
export async function requestFollow(_: ActionState, fd: FormData): Promise<ActionState> {
  const doctor = uuid(fd, "doctor_id");
  if (!doctor.success) return { error: "Choisissez un médecin." };
  if (fd.get("accord") !== "on") return { error: "Cochez la case pour autoriser ce médecin à voir vos mesures." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("care_request", { p_doctor: doctor.data, p_reason: str(fd, "reason").slice(0, 200), p_share_treatments: fd.get("share_treatments") === "on" });
  if (error) return { error: error.code === "23505" ? "Une demande est déjà en cours avec ce médecin." : humanizeError(error) };
  revalidatePath("/ma-sante/suivi");
  return { ok: true, message: "Demande envoyée. Le médecin ne verra vos mesures que s'il accepte." };
}

export async function setFollowStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid(fd, "id");
  const status = z.enum(["actif", "refuse", "termine"]).safeParse(str(fd, "status"));
  if (!id.success || !status.success) return { error: "Demande invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("care_set_status", { p_id: id.data, p_status: status.data });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/ma-sante/suivi"); revalidatePath("/medecin/suivis");
  return { ok: true, message: status.data === "actif" ? "Suivi accepté." : status.data === "refuse" ? "Demande refusée." : "Suivi terminé : l'accès aux mesures est fermé." };
}

export async function addFollowNote(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid(fd, "id");
  const body = str(fd, "body");
  if (!id.success || body.length < 2) return { error: "Écrivez votre note." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("care_add_note", { p_id: id.data, p_body: body.slice(0, 2000) });
  if (error) return { error: humanizeError(error) };
  revalidatePath(`/medecin/suivis/${id.data}`);
  return { ok: true, message: "Note envoyée au patient." };
}

export async function setCareFollowSwitch(_: ActionState, fd: FormData): Promise<ActionState> {
  const on = fd.get("on") === "1";
  if (on && fd.get("partenaire") !== "on") return { error: "Confirmez qu'un partenaire clinique a validé l'ouverture du suivi." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_care_follow", { p_on: on });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/admin/suivi"); revalidatePath("/ma-sante/suivi");
  return { ok: true, message: on ? "Suivi par un médecin ouvert." : "Suivi par un médecin fermé aux nouvelles demandes." };
}
