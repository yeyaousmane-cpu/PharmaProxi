"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { requireUser } from "@/lib/auth";
import { setFlash } from "@/lib/flash";

const uuid = z.uuid();
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const isoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const num = (v: string) => { const n = Number(v.replace(",", ".")); return v === "" || !Number.isFinite(n) ? null : n; };

// ---------------- Enfants et vaccins ----------------
export async function addChild(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("/ma-sante/enfants");
  const first = str(fd, "first_name"), birth = str(fd, "birth_date"), sex = str(fd, "sex");
  if (!first) return { error: "Indiquez le prénom de l'enfant." };
  if (!isoDate(birth)) return { error: "Indiquez la date de naissance." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("children").insert({ first_name: first, birth_date: birth, sex: sex === "F" || sex === "M" ? sex : null }).select("id").single();
  if (error) return { error: /check/.test(error.message) ? "Date de naissance invalide." : humanizeError(error) };
  // Doses déjà faites cochées à l'ajout (carnet existant)
  if (fd.get("already") === "on") {
    const { data: sched } = await supabase.from("vaccine_schedule").select("code, age_days");
    const today = new Date().toISOString().slice(0, 10);
    const rows = (sched ?? []).filter((d) => new Date(Date.parse(birth) + d.age_days * 86_400_000).toISOString().slice(0, 10) < today)
      .map((d) => ({ child_id: data.id, dose_code: d.code, done_on: new Date(Date.parse(birth) + d.age_days * 86_400_000).toISOString().slice(0, 10) }));
    if (rows.length) await supabase.from("child_vaccinations").insert(rows);
  }
  revalidatePath("/ma-sante");
  await setFlash(`Carnet de ${first} créé.`);
  redirect(`/ma-sante/enfants/${data.id}`);
}

export async function setDose(_: ActionState, fd: FormData): Promise<ActionState> {
  const child = uuid.safeParse(fd.get("child_id"));
  const code = str(fd, "dose_code");
  if (!child.success || !/^[A-Z0-9]{2,10}$/.test(code)) return { error: "Requête invalide" };
  const supabase = await createClient();
  if (fd.get("done") === "1") {
    const on = str(fd, "done_on") || new Date().toISOString().slice(0, 10);
    if (!isoDate(on)) return { error: "Date invalide." };
    const { error } = await supabase.from("child_vaccinations").upsert({ child_id: child.data, dose_code: code, done_on: on, place: str(fd, "place") || null });
    if (error) return { error: /check/.test(error.message) ? "La date ne peut pas être dans le futur." : humanizeError(error) };
  } else {
    const { error } = await supabase.from("child_vaccinations").delete().eq("child_id", child.data).eq("dose_code", code);
    if (error) return { error: humanizeError(error) };
  }
  revalidatePath(`/ma-sante/enfants/${child.data}`);
  return { ok: true };
}

export async function markVisitDone(_: ActionState, fd: FormData): Promise<ActionState> {
  const child = uuid.safeParse(fd.get("child_id"));
  const codes = String(fd.get("codes") ?? "").split(",").filter((c) => /^[A-Z0-9]{2,10}$/.test(c));
  const on = str(fd, "done_on") || new Date().toISOString().slice(0, 10);
  if (!child.success || !codes.length || !isoDate(on)) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.from("child_vaccinations").upsert(codes.map((c) => ({ child_id: child.data, dose_code: c, done_on: on })));
  if (error) return { error: /check/.test(error.message) ? "La date ne peut pas être dans le futur." : humanizeError(error) };
  revalidatePath(`/ma-sante/enfants/${child.data}`);
  return { ok: true, message: "Vaccins notés. Bravo !" };
}

export async function updateChild(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  if (fd.get("delete") === "1") {
    const { error } = await supabase.from("children").delete().eq("id", id.data);
    if (error) return { error: humanizeError(error) };
    revalidatePath("/ma-sante");
    await setFlash("Carnet supprimé.");
    redirect("/ma-sante/enfants");
  }
  const birth = str(fd, "birth_date"), sex = str(fd, "sex");
  if (!str(fd, "first_name") || !isoDate(birth)) return { error: "Prénom et date de naissance obligatoires." };
  const { error } = await supabase.from("children").update({ first_name: str(fd, "first_name"), birth_date: birth, sex: sex === "F" || sex === "M" ? sex : null, remind: fd.get("remind") === "on" }).eq("id", id.data);
  if (error) return { error: humanizeError(error) };
  revalidatePath(`/ma-sante/enfants/${id.data}`);
  return { ok: true, message: "Enregistré." };
}

// ---------------- Traitements ----------------
function parseTimes(fd: FormData) {
  return [...new Set(fd.getAll("times").map(String).map((t) => t.trim()).filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)))].sort().slice(0, 6);
}

export async function saveTreatment(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("/ma-sante/traitements");
  const id = str(fd, "id");
  if (id && !uuid.safeParse(id).success) return { error: "Requête invalide" };
  const name = str(fd, "name");
  if (name.length < 2) return { error: "Indiquez le nom du médicament." };
  const times = parseTimes(fd);
  if (!times.length) return { error: "Indiquez au moins une heure de prise." };
  const duration = str(fd, "duration_mode") === "long" ? null : num(str(fd, "duration_days"));
  if (duration !== null && (!Number.isInteger(duration) || duration < 1 || duration > 730)) return { error: "Durée : entre 1 et 730 jours." };
  const stock = num(str(fd, "units_in_stock")), per = num(str(fd, "units_per_intake")) ?? 1;
  const start = str(fd, "start_date") || new Date().toISOString().slice(0, 10);
  if (!isoDate(start)) return { error: "Date de début invalide." };
  const row = { name, dose_note: str(fd, "dose_note") || null, times, start_date: start, duration_days: duration, units_in_stock: stock, units_per_intake: per,
    stock_date: new Date().toISOString().slice(0, 10), remind_intake: fd.get("remind_intake") === "on", remind_renewal: fd.get("remind_renewal") === "on" };
  const supabase = await createClient();
  const { error } = id ? await supabase.from("treatments").update({ ...row, renewal_notified_on: null }).eq("id", id) : await supabase.from("treatments").insert(row);
  if (error) return { error: /check/.test(error.message) ? "Valeurs invalides (stock, quantité par prise, heures)." : humanizeError(error) };
  revalidatePath("/ma-sante/traitements");
  return { ok: true, message: id ? "Traitement mis à jour." : "Traitement ajouté. Ajoutez aussi le rappel à l'agenda de votre téléphone." };
}

export async function treatmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const op = str(fd, "op");
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  let error;
  if (op === "taken" || op === "untaken") {
    const slot = str(fd, "slot");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(slot)) return { error: "Requête invalide" };
    ({ error } = await supabase.from("treatment_intakes").upsert({ treatment_id: id.data, day: today, slot, taken_at: op === "taken" ? new Date().toISOString() : null }));
  } else if (op === "restock") {
    const stock = num(str(fd, "units_in_stock"));
    if (stock === null || stock < 0) return { error: "Indiquez le nombre de comprimés (ou doses) dont vous disposez." };
    ({ error } = await supabase.from("treatments").update({ units_in_stock: stock, stock_date: today, renewal_notified_on: null }).eq("id", id.data));
  } else if (op === "pause" || op === "resume") {
    ({ error } = await supabase.from("treatments").update({ active: op === "resume" }).eq("id", id.data));
  } else if (op === "delete") {
    ({ error } = await supabase.from("treatments").delete().eq("id", id.data));
  } else return { error: "Requête invalide" };
  if (error) return { error: humanizeError(error) };
  revalidatePath("/ma-sante/traitements");
  return { ok: true, message: op === "restock" ? "Stock mis à jour." : op === "delete" ? "Traitement supprimé." : undefined };
}

// ---------------- Mesures ----------------
export async function addMeasure(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("/ma-sante/mesures");
  const kind = str(fd, "kind");
  const at = str(fd, "measured_at");
  const measured_at = at ? new Date(`${at}:00Z`).toISOString() : new Date().toISOString();
  const supabase = await createClient();
  let row: Record<string, unknown>;
  if (kind === "tension") {
    const sys = num(str(fd, "systolic")), dia = num(str(fd, "diastolic")), pulse = num(str(fd, "pulse"));
    if (sys === null || dia === null) return { error: "Indiquez les deux chiffres de la tension (ex. 13/8 → 130 et 80)." };
    // « 13 » et « 8 » (centimètres de mercure, usage courant) → 130 / 80
    const s = sys < 30 ? sys * 10 : sys, d = dia < 20 ? dia * 10 : dia;
    row = { kind, systolic: Math.round(s), diastolic: Math.round(d), pulse: pulse === null ? null : Math.round(pulse) };
  } else if (kind === "glycemie") {
    const g = num(str(fd, "glucose")); const unit = str(fd, "unit");
    if (g === null) return { error: "Indiquez la valeur de la glycémie." };
    const gl = unit === "mgdl" ? g / 100 : unit === "mmol" ? (g * 18) / 1000 : g;
    row = { kind, glucose_gl: Math.round(gl * 100) / 100, context: ["a_jeun", "apres_repas", "autre"].includes(str(fd, "context")) ? str(fd, "context") : null };
  } else return { error: "Requête invalide" };
  const { error } = await supabase.from("health_measures").insert({ ...row, measured_at, note: str(fd, "note") || null });
  if (error) return { error: /check/.test(error.message) ? "Valeur hors des limites possibles : vérifiez la saisie et l'unité." : humanizeError(error) };
  revalidatePath("/ma-sante/mesures");
  return { ok: true, message: "Mesure enregistrée." };
}

export async function deleteMeasure(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.from("health_measures").delete().eq("id", id.data);
  if (error) return { error: humanizeError(error) };
  revalidatePath("/ma-sante/mesures");
  return { ok: true };
}

// ---------------- Préférences d'alerte ----------------
const GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export async function saveAlertPrefs(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("/ma-sante");
  const group = str(fd, "blood_group"); const region = str(fd, "region_id");
  const supabase = await createClient();
  const { error } = await supabase.from("user_alert_prefs").upsert({
    user_id: s.userId, health_alerts: fd.get("health_alerts") === "on", blood_alerts: fd.get("blood_alerts") === "on",
    blood_group: GROUPS.includes(group) ? group : null, region_id: uuid.safeParse(region).success ? region : null, updated_at: new Date().toISOString(),
  });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/ma-sante");
  return { ok: true, message: "Préférences enregistrées." };
}

// ---------------- Administration : besoins en sang, alertes officielles ----------------
export async function toggleAlert(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const fn = str(fd, "type") === "sang" ? "admin_save_blood_need" : "admin_save_health_alert";
  const { error } = await supabase.rpc(fn, { p: { id: id.data, active: fd.get("active") === "true" }, p_notify: false });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/don-de-sang"); revalidatePath("/alertes"); revalidatePath("/admin/alertes");
  return { ok: true, message: "Mis à jour." };
}

export async function saveBloodNeed(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const exp = str(fd, "expires_at");
  const { error } = await supabase.rpc("admin_save_blood_need", { p: {
    id: str(fd, "id") || null, facility: str(fd, "facility"), region_id: str(fd, "region_id"), blood_groups: fd.getAll("blood_groups").map(String).filter((g) => GROUPS.includes(g)),
    message: str(fd, "message"), where_to_give: str(fd, "where_to_give"), contact_phone: str(fd, "contact_phone"), source: str(fd, "source"),
    expires_at: exp ? new Date(`${exp}T23:59:00Z`).toISOString() : "", active: fd.has("active") ? fd.get("active") === "true" : undefined,
  }, p_notify: fd.get("notify") === "on" });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/don-de-sang"); revalidatePath("/admin/alertes");
  return { ok: true, message: "Besoin en sang enregistré." };
}

export async function saveHealthAlert(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const exp = str(fd, "expires_at");
  const { error } = await supabase.rpc("admin_save_health_alert", { p: {
    id: str(fd, "id") || null, kind: str(fd, "kind"), title: str(fd, "title"), body: str(fd, "body"), source_name: str(fd, "source_name"), source_url: str(fd, "source_url"),
    region_id: str(fd, "region_id"), expires_at: exp ? new Date(`${exp}T23:59:00Z`).toISOString() : "", active: fd.has("active") ? fd.get("active") === "true" : undefined,
  }, p_notify: fd.get("notify") === "on" });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/alertes"); revalidatePath("/admin/alertes"); revalidatePath("/");
  return { ok: true, message: "Alerte enregistrée." };
}
