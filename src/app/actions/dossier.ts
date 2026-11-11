"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { requireUser } from "@/lib/auth";
import { setFlash } from "@/lib/flash";
import { allow } from "@/lib/limiter";
import { clientIp } from "@/lib/request";
import { sealNote } from "@/lib/femme/crypto";
import { BLOOD_GROUPS, COVERAGE, KINDS, RELATIONS, SEALED, SEVERITY, allergyMatches, type FieldDef, type ItemKind } from "@/lib/dossier/config";

const uuid = z.uuid();
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const isoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const phoneOk = (v: string) => /^\+?[0-9 ]{8,20}$/.test(v);
const back = (fd: FormData) => { const b = str(fd, "back"); return b.startsWith("/ma-sante/dossier") ? b : "/ma-sante/dossier"; };
const done = (message: string): ActionState => { revalidatePath("/ma-sante/dossier", "layout"); return { ok: true, message }; };
const locked = (e: { message?: string } | null) => Boolean(e?.message && /PP423|row-level security/.test(e.message));
const LOCKED_MSG = "Votre dossier s'est verrouillé. Saisissez de nouveau votre code.";

// ---------------- Code d'accès ----------------
export async function unlockDossier(_: ActionState, fd: FormData): Promise<ActionState> {
  if (!(await allow(`dossier-pin:${await clientIp()}`, 20, 15 * 60_000))) return { error: "Trop d'essais. Réessayez dans quelques minutes." };
  await requireUser("/ma-sante/dossier");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_unlock", { p_pin: str(fd, "pin") });
  if (error) return { error: humanizeError(error) };
  if (!data) return { error: "Code incorrect. Après 5 erreurs, le dossier est bloqué 15 minutes." };
  await supabase.rpc("record_log_access", { p_person: null, p_action: "ouverture_dossier" }); // visible dans « Partages et accès »
  revalidatePath("/ma-sante/dossier", "layout");
  redirect(back(fd));
}

export async function lockDossier() {
  const supabase = await createClient();
  await supabase.rpc("record_lock");
  revalidatePath("/ma-sante/dossier", "layout");
  redirect("/ma-sante/dossier");
}

export async function setDossierPin(_: ActionState, fd: FormData): Promise<ActionState> {
  const remove = fd.get("remove") === "1";
  const pin = str(fd, "pin");
  if (!remove) {
    if (!/^\d{4,6}$/.test(pin)) return { error: "Le code doit contenir 4 à 6 chiffres.", fieldErrors: { pin: "4 à 6 chiffres" } };
    if (pin !== str(fd, "pin2")) return { error: "Les deux codes ne sont pas identiques.", fieldErrors: { pin2: "Différent du premier" } };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_set_pin", { p_pin: remove ? "" : pin });
  if (error) return { error: humanizeError(error) };
  return done(remove ? "Code retiré : le dossier s'ouvre sans code." : "Code enregistré. Le dossier se verrouille après 30 minutes sans activité.");
}

// ---------------- Proches ----------------
export async function savePerson(_: ActionState, fd: FormData): Promise<ActionState> {
  const name = str(fd, "display_name"), relation = str(fd, "relation"), sex = str(fd, "sex"), by = str(fd, "birth_year");
  const id = str(fd, "id");
  const supabase = await createClient();
  if (id && fd.get("delete") === "1") {
    if (!uuid.safeParse(id).success) return { error: "Requête invalide" };
    const { error } = await supabase.from("record_persons").delete().eq("id", id).eq("is_self", false);
    if (error) return { error: locked(error) ? LOCKED_MSG : humanizeError(error) };
    revalidatePath("/ma-sante/dossier", "layout");
    await setFlash("Dossier supprimé.");
    redirect("/ma-sante/dossier/proches");
  }
  if (!name) return { error: "Indiquez un prénom ou un nom.", fieldErrors: { display_name: "Obligatoire" } };
  const year = by ? Number(by) : null;
  if (year !== null && (!Number.isInteger(year) || year < 1900 || year > new Date().getUTCFullYear())) return { error: "Année de naissance invalide.", fieldErrors: { birth_year: "Année invalide" } };
  const row = { display_name: name.slice(0, 60), relation: relation in RELATIONS ? relation : null, sex: sex === "F" || sex === "M" ? sex : null, birth_year: year };
  if (id) {
    if (!uuid.safeParse(id).success) return { error: "Requête invalide" };
    const { error } = await supabase.from("record_persons").update(fd.get("is_self") === "1" ? { ...row, relation: "moi" } : row).eq("id", id);
    if (error) return { error: locked(error) ? LOCKED_MSG : humanizeError(error) };
    return done("Enregistré.");
  }
  const { data, error } = await supabase.from("record_persons").insert(row).select("id").single();
  if (error) return { error: locked(error) ? LOCKED_MSG : humanizeError(error) };
  revalidatePath("/ma-sante/dossier", "layout");
  await setFlash(`Dossier de ${name} créé.`);
  redirect(`/ma-sante/dossier?p=${data.id}`);
}

// ---------------- Informations essentielles, couverture, don de sang ----------------
export async function saveEssentials(_: ActionState, fd: FormData): Promise<ActionState> {
  const person = uuid.safeParse(fd.get("person_id"));
  if (!person.success) return { error: "Requête invalide" };
  const part = str(fd, "_part");
  const row: Record<string, unknown> = { person_id: person.data };
  const fe: Record<string, string> = {};
  if (part === "base") {
    const bg = str(fd, "blood_group");
    row.blood_group = (BLOOD_GROUPS as readonly string[]).includes(bg) || bg === "inconnu" ? bg : null;
    const h = str(fd, "height_cm"), wt = str(fd, "weight_kg").replace(",", ".");
    row.height_cm = h ? Number(h) : null;
    row.weight_kg = wt ? Number(wt) : null;
    if (row.height_cm !== null && !(Number.isInteger(row.height_cm) && (row.height_cm as number) >= 30 && (row.height_cm as number) <= 250)) fe.height_cm = "Entre 30 et 250 cm";
    if (row.weight_kg !== null && !(Number.isFinite(row.weight_kg) && (row.weight_kg as number) >= 1 && (row.weight_kg as number) <= 400)) fe.weight_kg = "Entre 1 et 400 kg";
    row.pregnant = fd.get("pregnant") === "on";
    row.breastfeeding = fd.get("breastfeeding") === "on";
  } else if (part === "urgence") {
    row.emergency_name = str(fd, "emergency_name").slice(0, 80) || null;
    row.emergency_relation = str(fd, "emergency_relation").slice(0, 40) || null;
    const ph = str(fd, "emergency_phone");
    row.emergency_phone = ph || null;
    if (ph && !phoneOk(ph)) fe.emergency_phone = "Numéro invalide (ex. +223 70 00 00 00)";
  } else if (part === "couverture") {
    const c = str(fd, "coverage");
    row.coverage = c in COVERAGE ? c : null;
    row.insurer = str(fd, "insurer").slice(0, 80) || null;
    row.insured_number = str(fd, "insured_number").slice(0, 40) || null;
  } else if (part === "don") {
    const d = str(fd, "last_donation");
    if (d && (!isoDate(d) || d > new Date().toISOString().slice(0, 10))) fe.last_donation = "Date invalide";
    row.last_donation = d || null;
  } else return { error: "Requête invalide" };
  if (Object.keys(fe).length) return { error: "Vérifiez les champs signalés.", fieldErrors: fe };
  const supabase = await createClient();
  const { error } = await supabase.from("record_essentials").upsert(row, { onConflict: "person_id" });
  if (error) return { error: locked(error) ? LOCKED_MSG : humanizeError(error) };
  return done("Enregistré.");
}

// ---------------- Éléments du dossier ----------------
function readField(f: FieldDef, fd: FormData, fe: Record<string, string>) {
  const v = str(fd, f.name);
  if (!v) { if (f.required) fe[f.name] = "Obligatoire"; return null; }
  switch (f.type) {
    case "year": { const y = Number(v); if (!Number.isInteger(y) || y < 1900 || y > new Date().getUTCFullYear() + 1) fe[f.name] = "Année invalide"; return y; }
    case "date": if (!isoDate(v)) fe[f.name] = "Date invalide"; return v;
    case "time": if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) fe[f.name] = "Heure invalide"; return v;
    case "phone": if (!phoneOk(v)) fe[f.name] = "Numéro invalide"; return v;
    case "select": if (f.name === "severity" ? !(v in SEVERITY) : !f.options?.includes(v)) fe[f.name] = "Choix invalide"; return v;
    case "textarea": if (v.length > 4000) fe[f.name] = "Texte trop long"; return v;
    default: if (v.length > 120) fe[f.name] = "120 caractères maximum"; return v;
  }
}

export async function saveItem(_: ActionState, fd: FormData): Promise<ActionState> {
  const person = uuid.safeParse(fd.get("person_id"));
  const kind = str(fd, "kind") as ItemKind;
  const def = KINDS[kind];
  if (!person.success || !def) return { error: "Requête invalide" };
  const id = str(fd, "id");
  const fe: Record<string, string> = {};
  const row: Record<string, unknown> = {};
  for (const f of def.fields) {
    const v = readField(f, fd, fe);
    row[f.name] = v !== null && SEALED.includes(f.name) ? sealNote(String(v)) : v;
  }
  if (Object.keys(fe).length) return { error: "Vérifiez les champs signalés.", fieldErrors: fe };
  const supabase = await createClient();
  let warn = "";

  if (kind === "ordonnance" || kind === "ancien_traitement") {
    const { data: al } = await supabase.from("record_items").select("title").eq("person_id", person.data).eq("kind", "allergie");
    const hits = allergyMatches(String(row.title), (al ?? []).map((a) => a.title));
    if (hits.length) warn = ` Attention : vous avez indiqué une allergie à ${hits.join(", ")}. Parlez-en à votre pharmacien ou à votre médecin avant de prendre ce médicament.`;
  }

  if (id) {
    if (!uuid.safeParse(id).success) return { error: "Requête invalide" };
    const { error } = await supabase.from("record_items").update(row).eq("id", id).eq("person_id", person.data);
    if (error) return { error: locked(error) ? LOCKED_MSG : humanizeError(error) };
    return done(`Enregistré.${warn}`);
  }

  // Ordonnance : création facultative des rappels de prise (Ma santé > Traitements)
  if (kind === "ordonnance" && fd.get("remind") === "on") {
    const times = fd.getAll("times").map(String).filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t));
    const days = Number(str(fd, "duration_days"));
    if (!times.length) return { error: "Indiquez au moins une heure de prise pour les rappels.", fieldErrors: { times: "Obligatoire" } };
    const { data: p } = await supabase.from("record_persons").select("is_self, display_name").eq("id", person.data).single();
    const name = `${p && !p.is_self ? `(${p.display_name}) ` : ""}${String(row.title)}`.slice(0, 120);
    const { data: t, error: te } = await supabase.from("treatments").insert({
      name, times: [...new Set(times)].sort(), start_date: (row.event_date as string) || new Date().toISOString().slice(0, 10),
      duration_days: Number.isInteger(days) && days >= 1 && days <= 730 ? days : null,
    }).select("id").single();
    if (te) return { error: humanizeError(te) };
    row.treatment_id = t.id;
  }
  const { error } = await supabase.from("record_items").insert({ ...row, person_id: person.data, kind });
  if (error) return { error: locked(error) ? LOCKED_MSG : humanizeError(error) };
  revalidatePath("/ma-sante", "layout");
  return done(`${row.treatment_id ? "Ajouté, et rappels de prise créés." : "Ajouté."}${warn}`);
}

export async function deleteItem(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.from("record_items").delete().eq("id", id.data);
  if (error) return { error: locked(error) ? LOCKED_MSG : humanizeError(error) };
  return done("Supprimé.");
}

/** Ajout rapide d'une maladie courante (cases à cocher). */
export async function toggleCondition(_: ActionState, fd: FormData): Promise<ActionState> {
  const person = uuid.safeParse(fd.get("person_id"));
  const title = str(fd, "title");
  if (!person.success || !title || title.length > 120) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { data: ex } = await supabase.from("record_items").select("id").eq("person_id", person.data).eq("kind", "maladie").eq("title", title).limit(1);
  const { error } = ex?.length
    ? await supabase.from("record_items").delete().eq("id", ex[0].id)
    : await supabase.from("record_items").insert({ person_id: person.data, kind: "maladie", title });
  if (error) return { error: locked(error) ? LOCKED_MSG : humanizeError(error) };
  return done(ex?.length ? `${title} retiré.` : `${title} ajouté.`);
}
