"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import {
  catalogItemSchema, fieldErrors, formObject, parseOpeningHours, pharmacyPrivateSchema, pharmacySchema, stockSchema,
} from "@/lib/validation";
import { parseInventoryCsv } from "@/lib/csv";
import { PHARMACY_COOKIE } from "@/lib/pharmacy";

const uuid = z.uuid();

export async function selectPharmacy(fd: FormData) {
  const id = uuid.safeParse(fd.get("pharmacy_id"));
  if (id.success) (await cookies()).set(PHARMACY_COOKIE, id.data, { httpOnly: true, sameSite: "lax", path: "/pharmacien", secure: process.env.NODE_ENV === "production" });
  revalidatePath("/pharmacien", "layout");
}

export async function registerPharmacy(_: ActionState, fd: FormData): Promise<ActionState> {
  const obj = formObject(fd);
  const a = pharmacySchema.safeParse(obj);
  const b = pharmacyPrivateSchema.safeParse(obj);
  if (!a.success || !b.success) {
    return { error: "Vérifiez le formulaire", fieldErrors: { ...(a.success ? {} : fieldErrors(a.error)), ...(b.success ? {} : fieldErrors(b.error)) } };
  }
  let hours: Record<string, [string, string][]>;
  try {
    hours = parseOpeningHours(fd);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_pharmacy", { p: { ...a.data, ...b.data, opening_hours: hours } });
  if (error) return { error: humanizeError(error) };
  (await cookies()).set(PHARMACY_COOKIE, data as string, { httpOnly: true, sameSite: "lax", path: "/pharmacien" });
  revalidatePath("/", "layout");
  redirect("/pharmacien/ma-pharmacie?inscrite=1#justificatifs");
}

export async function updatePharmacy(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("pharmacy_id"));
  const obj = formObject(fd);
  const a = pharmacySchema.safeParse(obj);
  const b = pharmacyPrivateSchema.safeParse(obj);
  if (!id.success) return { error: "Pharmacie invalide" };
  if (!a.success || !b.success) {
    return { error: "Vérifiez le formulaire", fieldErrors: { ...(a.success ? {} : fieldErrors(a.error)), ...(b.success ? {} : fieldErrors(b.error)) } };
  }
  let hours: Record<string, [string, string][]>;
  try {
    hours = parseOpeningHours(fd);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const supabase = await createClient();
  const p = a.data;
  const { data: upd, error } = await supabase.from("pharmacies").update({
    name: p.name, address: p.address, region_id: p.region_id, circle_id: p.circle_id ?? null, commune_id: p.commune_id ?? null,
    locality_id: p.locality_id ?? null, phone: p.phone, whatsapp: p.whatsapp ?? null, email: p.email ?? null,
    latitude: p.latitude ?? null, longitude: p.longitude ?? null, offers_pickup: p.offers_pickup, offers_delivery: p.offers_delivery,
    opening_hours: hours,
  }).eq("id", id.data).select("id");
  if (error) return { error: humanizeError(error) };
  if (!upd?.length) return { error: "Modification impossible (pharmacie suspendue ou accès refusé)." };
  const { error: e2 } = await supabase.from("pharmacy_private").update({
    pharmacist_in_charge: b.data.pharmacist_in_charge, legal_name: b.data.legal_name || null, license_number: b.data.license_number || null,
    order_registration: b.data.order_registration || null, tax_id: b.data.tax_id || null, rccm: b.data.rccm || null, manager_phone: b.data.manager_phone ?? null,
  }).eq("pharmacy_id", id.data);
  if (e2) return { error: humanizeError(e2) };
  revalidatePath("/pharmacien", "layout");
  revalidatePath(`/pharmacies/${id.data}`);
  return { ok: true, message: "Informations enregistrées. Toute modification des horaires devra être revérifiée." };
}

const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const DOC_TYPES = ["autorisation_ouverture", "diplome_pharmacien", "inscription_ordre", "rccm", "nif", "piece_identite", "autre"] as const;

/** Dépôt d'un justificatif dans le stockage privé (accès : membres et administration). */
export async function uploadDocument(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("pharmacy_id"));
  const type = z.enum(DOC_TYPES).safeParse(fd.get("doc_type"));
  const file = fd.get("file");
  if (!id.success || !type.success) return { error: "Requête invalide" };
  if (!(file instanceof File) || file.size === 0) return { error: "Choisissez un fichier." };
  if (file.size > 5 * 1024 * 1024) return { error: "Fichier trop volumineux (5 Mo maximum)." };
  if (!ALLOWED_MIME.includes(file.type)) return { error: "Formats acceptés : PDF, JPEG, PNG, WebP." };
  const ext = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Session expirée" };
  const path = `${id.data}/${type.data}-${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("pharmacy-documents").upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { error: humanizeError(upErr) };
  const { error } = await supabase.from("pharmacy_documents").insert({
    pharmacy_id: id.data, doc_type: type.data, storage_path: path, file_name: file.name.slice(0, 200), uploaded_by: auth.user.id,
  });
  if (error) {
    await supabase.storage.from("pharmacy-documents").remove([path]);
    return { error: humanizeError(error) };
  }
  revalidatePath("/pharmacien/ma-pharmacie");
  return { ok: true, message: "Justificatif déposé." };
}

export async function deleteDocument(fd: FormData) {
  const id = uuid.safeParse(fd.get("document_id"));
  if (!id.success) return;
  const supabase = await createClient();
  const { data: doc } = await supabase.from("pharmacy_documents").select("storage_path").eq("id", id.data).maybeSingle();
  if (!doc) return;
  const { error } = await supabase.from("pharmacy_documents").delete().eq("id", id.data);
  if (!error) await supabase.storage.from("pharmacy-documents").remove([doc.storage_path]);
  revalidatePath("/pharmacien/ma-pharmacie");
}

export async function resubmitPharmacy(fd: FormData) {
  const id = uuid.safeParse(fd.get("pharmacy_id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.rpc("resubmit_pharmacy", { p_pharmacy: id.data });
  revalidatePath("/pharmacien", "layout");
}

/**
 * Mise à jour rapide d'une ligne de stock (formulaire compact, utilisable sur mobile).
 * La version affichée est vérifiée en base : si la ligne a changé entre-temps
 * (vente, autre membre de l'équipe, import), la modification est refusée.
 */
export async function updateStock(_: ActionState, fd: FormData): Promise<ActionState> {
  const inv = uuid.safeParse(fd.get("inventory_id"));
  const version = Number(fd.get("row_version"));
  const parsed = stockSchema.safeParse(formObject(fd));
  if (!inv.success || !Number.isInteger(version)) return { error: "Requête invalide" };
  if (!parsed.success) return { error: Object.values(fieldErrors(parsed.error))[0] };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_inventory_line", {
    p_inventory: inv.data, p_expected_version: version, p_quantity: parsed.data.quantity,
    p_price: parsed.data.price_xof ?? null, p_available: parsed.data.is_available, p_threshold: parsed.data.low_stock_threshold ?? null,
  });
  if (error) return { error: humanizeError(error), data: { conflict: /entre-temps/.test(error.message) } };
  revalidatePath("/pharmacien", "layout");
  return { ok: true, message: "Enregistré", data: { version: data } };
}

export async function confirmAllFresh(_: ActionState, fd: FormData): Promise<ActionState> {
  const ids = fd.getAll("inventory_id").map(String).filter((v) => uuid.safeParse(v).success);
  if (!ids.length) return { error: "Aucune ligne sélectionnée." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_inventory_fresh", { p_inventory_ids: ids });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/pharmacien", "layout");
  return { ok: true, message: `${data} ligne(s) confirmée(s) à l'identique.` };
}

/** Ajout d'un produit : fiche catalogue existante ou nouvelle (dédoublonnée en base), puis stock. */
export async function addProduct(_: ActionState, fd: FormData): Promise<ActionState> {
  const ph = uuid.safeParse(fd.get("pharmacy_id"));
  if (!ph.success) return { error: "Requête invalide" };
  const stock = stockSchema.safeParse({ ...formObject(fd), is_available: fd.get("is_available") ?? "on" });
  if (!stock.success) return { error: "Vérifiez le stock", fieldErrors: fieldErrors(stock.error) };
  const supabase = await createClient();
  let catalogId = String(fd.get("catalog_id") ?? "");
  if (!uuid.safeParse(catalogId).success) {
    const item = catalogItemSchema.safeParse(formObject(fd));
    if (!item.success) return { error: "Vérifiez la fiche produit", fieldErrors: fieldErrors(item.error) };
    const { data, error } = await supabase.rpc("upsert_catalog_item", { p: item.data });
    if (error) return { error: humanizeError(error) };
    catalogId = data as string;
  }
  const { error } = await supabase.rpc("set_inventory", {
    p_pharmacy: ph.data, p_catalog: catalogId, p_quantity: stock.data.quantity, p_price: stock.data.price_xof ?? null,
    p_available: stock.data.is_available, p_threshold: stock.data.low_stock_threshold ?? null, p_note: "Ajout du produit",
  });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/pharmacien", "layout");
  return { ok: true, message: "Produit ajouté au stock." };
}

export async function importCsv(_: ActionState, fd: FormData): Promise<ActionState> {
  const ph = uuid.safeParse(fd.get("pharmacy_id"));
  const file = fd.get("file");
  if (!ph.success) return { error: "Requête invalide" };
  if (!(file instanceof File) || file.size === 0) return { error: "Choisissez un fichier CSV." };
  if (file.size > 2 * 1024 * 1024) return { error: "Fichier trop volumineux (2 Mo maximum)." };
  const parsed = parseInventoryCsv(await file.text());
  if (parsed.missingColumns.length) return { error: `Colonnes obligatoires manquantes : ${parsed.missingColumns.join(", ")}` };
  if (!parsed.rows.length) return { error: "Aucune ligne valide.", data: { errors: parsed.errors } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_inventory", { p_pharmacy: ph.data, p_rows: parsed.rows });
  if (error) return { error: humanizeError(error) };
  const rep = data as { imported: number; failed: number; errors: { row: number; error: string }[] };
  revalidatePath("/pharmacien", "layout");
  // Les numéros de ligne renvoyés par la base sont relatifs aux lignes valides : on les remappe
  const validLines: number[] = [];
  const invalid = new Set(parsed.errors.map((e) => e.row));
  for (let line = 2, n = 0; n < parsed.rows.length; line++) if (!invalid.has(line)) { validLines.push(line); n++; }
  const allErrors = [...parsed.errors, ...rep.errors.map((e) => ({ row: validLines[e.row - 1] ?? e.row, error: e.error }))].sort((a, b) => a.row - b.row);
  return {
    ok: true,
    message: `${rep.imported} ligne(s) importée(s), ${allErrors.length} en erreur.`,
    data: { errors: allErrors.slice(0, 100) },
  };
}

const batchSchema = z.object({
  inventory_id: z.uuid(),
  lot_number: z.string().trim().min(1, "N° de lot requis").max(60),
  expiry_date: z.iso.date("Date invalide"),
  quantity: z.coerce.number().int().min(0),
});

export async function addBatch(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = batchSchema.safeParse(formObject(fd));
  if (!parsed.success) return { error: "Vérifiez le lot", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("inventory_batches").insert(parsed.data);
  if (error) return { error: humanizeError(error) };
  revalidatePath(`/pharmacien/stocks/${parsed.data.inventory_id}`);
  return { ok: true, message: "Lot enregistré." };
}

export async function deleteBatch(fd: FormData) {
  const id = uuid.safeParse(fd.get("batch_id"));
  const inv = uuid.safeParse(fd.get("inventory_id"));
  if (!id.success || !inv.success) return;
  const supabase = await createClient();
  await supabase.from("inventory_batches").delete().eq("id", id.data);
  revalidatePath(`/pharmacien/stocks/${inv.data}`);
}

export async function addTeamMember(_: ActionState, fd: FormData): Promise<ActionState> {
  const ph = uuid.safeParse(fd.get("pharmacy_id"));
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!ph.success) return { error: "Requête invalide" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Adresse e-mail invalide", fieldErrors: { email: "Adresse e-mail invalide" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("pharmacy_add_member", { p_pharmacy: ph.data, p_email: email });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/pharmacien/ma-pharmacie");
  return { ok: true, message: "Collaborateur ajouté. Il accède désormais aux stocks et aux commandes." };
}

export async function removeTeamMember(_: ActionState, fd: FormData): Promise<ActionState> {
  const ph = uuid.safeParse(fd.get("pharmacy_id"));
  const user = uuid.safeParse(fd.get("user_id"));
  if (!ph.success || !user.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("pharmacy_remove_member", { p_pharmacy: ph.data, p_user: user.data });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/pharmacien/ma-pharmacie");
  return { ok: true, message: "Collaborateur retiré." };
}
