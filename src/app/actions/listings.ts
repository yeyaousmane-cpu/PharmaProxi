"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { setFlash } from "@/lib/flash";

const uuid = z.uuid();
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const BASE = "/admin/pharmacies-non-inscrites";

function refresh(id?: string) {
  revalidatePath(BASE);
  if (id) revalidatePath(`${BASE}/${id}`);
  revalidatePath("/pharmacies");
  revalidatePath("/carte");
}

const listingSchema = z.object({
  name: z.string().trim().min(2, "2 caractères minimum").max(160),
  region_id: uuid,
  commune_id: z.union([uuid, z.literal("")]).optional(),
  locality_id: z.union([uuid, z.literal("")]).optional(),
  area_label: z.string().trim().max(200).optional(),
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(40).optional(),
  latitude: z.string().trim().max(20).optional(),
  longitude: z.string().trim().max(20).optional(),
  source: z.string().trim().max(200).optional(),
});

export async function saveListing(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = Object.fromEntries(["name", "region_id", "commune_id", "locality_id", "area_label", "address", "phone", "latitude", "longitude", "source"].map((k) => [k, s(fd, k)]));
  const parsed = listingSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
    return { error: "Vérifiez le formulaire", fieldErrors };
  }
  const id = s(fd, "id");
  const coord = (v?: string) => (v ? v.replace(",", ".") : "");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_save_listing", {
    p: { ...parsed.data, id: uuid.safeParse(id).success ? id : "", latitude: coord(parsed.data.latitude), longitude: coord(parsed.data.longitude) },
  });
  if (error) return { error: humanizeError(error) };
  refresh(data as string);
  if (!id) {
    await setFlash("Fiche ajoutée à l'annuaire.");
    redirect(`${BASE}/${data}`);
  }
  return { ok: true, message: "Fiche enregistrée." };
}

export async function setListingPublished(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const published = fd.get("published") === "true";
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_listing_published", { p_id: id.data, p_published: published });
  if (error) return { error: humanizeError(error) };
  refresh(id.data);
  await setFlash(published ? "Fiche publiée." : "Fiche masquée du public.");
  return { ok: true, message: published ? "Fiche publiée." : "Fiche masquée du public." };
}

export async function linkListing(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  const pharmacy = s(fd, "pharmacy_id");
  if (!id.success || (pharmacy && !uuid.safeParse(pharmacy).success)) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_link_listing", { p_id: id.data, p_pharmacy: pharmacy || null });
  if (error) return { error: humanizeError(error) };
  refresh(id.data);
  const msg = pharmacy ? "Fiche rattachée : elle n'apparaît plus, la pharmacie inscrite la remplace." : "Rattachement annulé : la fiche est de nouveau visible.";
  await setFlash(msg);
  return { ok: true, message: msg };
}

export async function deleteListing(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_listing", { p_id: id.data });
  if (error) return { error: humanizeError(error) };
  refresh();
  await setFlash("Fiche supprimée.");
  redirect(BASE);
}

// En-têtes acceptés (insensibles à la casse, aux accents et aux espaces)
const HEADERS: Record<string, string> = {
  nom: "name", name: "name", pharmacie: "name", officine: "name", "raison sociale": "name", raison_sociale: "name",
  region: "region", ville: "region",
  commune: "commune", cercle_commune: "commune",
  quartier: "quartier", localite: "quartier", village: "quartier",
  adresse: "address", address: "address",
  telephone: "phone", tel: "phone", phone: "phone", contact: "phone",
  latitude: "latitude", lat: "latitude",
  longitude: "longitude", lng: "longitude", lon: "longitude",
  source: "source",
};
const normHeader = (h: string) => h.replace(/^﻿/, "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\.$/, "");

export async function importListings(_: ActionState, fd: FormData): Promise<ActionState> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choisissez un fichier CSV." };
  if (file.size > 3 * 1024 * 1024) return { error: "3 Mo maximum." };
  if (/\.xlsx?$/i.test(file.name)) {
    return { error: "Ce fichier est au format Excel. Dans Excel : Fichier › Enregistrer sous › « CSV UTF-8 (délimité par des virgules) », puis importez le fichier .csv." };
  }
  // Excel enregistre parfois en Windows-1252 : on le détecte pour garder les accents
  const buf = new Uint8Array(await file.arrayBuffer());
  let text = new TextDecoder("utf-8").decode(buf);
  if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buf);

  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true, skipEmptyLines: "greedy", transformHeader: (h) => HEADERS[normHeader(h)] ?? normHeader(h),
  });
  const fields = parsed.meta.fields ?? [];
  if (!fields.includes("name") || !fields.includes("region")) {
    return { error: "Colonnes obligatoires : nom et region. Facultatives : commune, quartier, adresse, telephone, latitude, longitude, source. Utilisez le modèle." };
  }
  if (parsed.data.length === 0) return { error: "Le fichier ne contient aucune ligne." };
  if (parsed.data.length > 5000) return { error: "5 000 lignes maximum par import : découpez le fichier." };
  const source = s(fd, "source");
  const rows = parsed.data.map((r, i) => ({
    line: i + 2, name: r.name ?? "", region: r.region ?? "", commune: r.commune ?? "", quartier: r.quartier ?? "",
    address: r.address ?? "", phone: r.phone ?? "", latitude: r.latitude ?? "", longitude: r.longitude ?? "",
    source: (r.source ?? "").trim() || source,
  }));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_import_listings", { p_rows: rows });
  if (error) return { error: humanizeError(error) };
  refresh();
  const res = data as { imported: number; duplicates: number; failed: number; errors: { row: number; error: string }[] };
  const summary = `${res.imported} fiche(s) importée(s), ${res.duplicates} doublon(s) ignoré(s), ${res.failed} ligne(s) en erreur.`;
  if (res.failed > 0) {
    const detail = res.errors.slice(0, 15).map((e) => `Ligne ${e.row} : ${e.error}`).join(" · ");
    return { ok: true, message: `${summary} ${detail}${res.failed > 15 ? " · …" : ""}` };
  }
  return { ok: true, message: summary };
}
