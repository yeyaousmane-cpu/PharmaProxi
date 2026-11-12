"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const on = (fd: FormData, k: string) => fd.get(k) === "on";
const uid = (fd: FormData, k = "id") => z.uuid().safeParse(fd.get(k));
const all = () => { for (const p of ["/premiers-secours", "/premiers-secours/formations", "/premiers-secours/badge", "/premiers-secours/espace-formateur", "/admin/premiers-secours"]) revalidatePath(p); };

export async function registerTraining(_: ActionState, fd: FormData): Promise<ActionState> {
  const org = uid(fd, "organization_id");
  if (!org.success) return { error: "Choisissez un organisme." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("first_aid_register", { p: { organization_id: org.data, course_id: str(fd, "course_id"), region_id: str(fd, "region_id"),
    locality: str(fd, "locality").slice(0, 120), audience: str(fd, "audience"), message: str(fd, "message").slice(0, 500), share_contact: on(fd, "share_contact") } });
  if (error) return { error: humanizeError(error) };
  all();
  return { ok: true, message: `Demande ${data as string} envoyée. L'organisme vous répondra ; suivez son statut ci-dessous.` };
}

export async function setRegistrationStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = uid(fd); const st = z.enum(["en_attente", "confirmee", "terminee", "annulee"]).safeParse(str(fd, "status"));
  if (!r.success || !st.success) return { error: "Requête invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("first_aid_set_registration", { p_id: r.data, p_status: st.data, p_note: str(fd, "note").slice(0, 300) });
  if (error) return { error: humanizeError(error) };
  all();
  return { ok: true, message: "Demande mise à jour." };
}

export async function declareTraining(_: ActionState, fd: FormData): Promise<ActionState> {
  const org = uid(fd, "organization_id");
  if (!org.success) return { error: "Choisissez l'organisme formateur." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str(fd, "completed_on"))) return { error: "Indiquez la date de la formation.", fieldErrors: { completed_on: "Obligatoire" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("first_aid_declare", { p: { organization_id: org.data, course_label: str(fd, "course_label").slice(0, 160), completed_on: str(fd, "completed_on"),
    region_id: str(fd, "region_id"), evidence_note: str(fd, "evidence_note").slice(0, 300), show_name: on(fd, "show_name") } });
  if (error) return { error: humanizeError(error) };
  all();
  return { ok: true, message: "Formation déclarée. Le badge sera délivré seulement après vérification par l'organisme formateur." };
}

export async function verifyTraining(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = uid(fd); const d = z.enum(["verifiee", "non_confirmee"]).safeParse(str(fd, "decision"));
  if (!c.success || !d.success) return { error: "Requête invalide." };
  const exp = str(fd, "expires_on");
  const supabase = await createClient();
  const { error } = await supabase.rpc("first_aid_verify", { p_id: c.data, p_decision: d.data, p_expires: /^\d{4}-\d{2}-\d{2}$/.test(exp) ? exp : null, p_note: str(fd, "note").slice(0, 300) });
  if (error) return { error: humanizeError(error) };
  all();
  return { ok: true, message: d.data === "verifiee" ? "Formation vérifiée : le badge est délivré." : "Formation non confirmée : le déclarant est prévenu du motif." };
}

export async function setBadgeVisibility(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = uid(fd);
  if (!c.success) return { error: "Requête invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("first_aid_set_show_name", { p_id: c.data, p_show: str(fd, "show") === "1", p_renew: str(fd, "renew") === "1" });
  if (error) return { error: humanizeError(error) };
  all();
  return { ok: true, message: str(fd, "renew") === "1" ? "Nouveau QR code créé : l'ancien ne fonctionne plus." : "Préférence enregistrée." };
}

export async function proposeCourse(_: ActionState, fd: FormData): Promise<ActionState> {
  const org = uid(fd, "organization_id");
  if (!org.success) return { error: "Organisme invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("first_aid_propose_course", { p: { organization_id: org.data, title: str(fd, "title").slice(0, 160), description: str(fd, "description").slice(0, 1000),
    region_id: str(fd, "region_id"), place: str(fd, "place").slice(0, 200), starts_on: str(fd, "starts_on"), ends_on: str(fd, "ends_on"), capacity: str(fd, "capacity"),
    conditions: str(fd, "conditions").slice(0, 500), registration_url: str(fd, "registration_url") } });
  if (error) return { error: humanizeError(error) };
  all();
  return { ok: true, message: "Session proposée : elle sera publiée après validation par l'administration." };
}

export async function proposeCampaign(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("first_aid_propose_campaign", { p: { organization_id: str(fd, "organization_id"), title: str(fd, "title").slice(0, 160), description: str(fd, "description").slice(0, 1000),
    audience: str(fd, "audience"), region_id: str(fd, "region_id"), place: str(fd, "place").slice(0, 200), starts_on: str(fd, "starts_on"), ends_on: str(fd, "ends_on") } });
  if (error) return { error: humanizeError(error) };
  all();
  return { ok: true, message: "Campagne enregistrée (publiée après validation)." };
}

export async function moderateFirstAid(_: ActionState, fd: FormData): Promise<ActionState> {
  const i = uid(fd); const t = z.enum(["course", "campaign"]).safeParse(str(fd, "table"));
  if (!i.success || !t.success) return { error: "Requête invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_first_aid_moderate", { p_table: t.data, p_id: i.data, p_status: str(fd, "status") });
  if (error) return { error: humanizeError(error) };
  all();
  return { ok: true, message: "Décision enregistrée." };
}

export async function saveFirstAidOrg(_: ActionState, fd: FormData): Promise<ActionState> {
  const i = uid(fd);
  if (!i.success) return { error: "Requête invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_first_aid_org", { p_id: i.data, p_status: str(fd, "partnership_status") || null, p_note: str(fd, "partnership_note").slice(0, 300),
    p_published: on(fd, "published"), p_member_email: str(fd, "member_email") || null, p_remove_member: null });
  if (error) return { error: humanizeError(error) };
  all();
  return { ok: true, message: "Organisme mis à jour." };
}
