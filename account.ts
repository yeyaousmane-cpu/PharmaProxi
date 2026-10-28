"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { humanizeError, type ActionState } from "@/lib/errors";
import { addressSchema, fieldErrors, formObject, profileSchema } from "@/lib/validation";

async function uid() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/connexion?suite=/compte");
  return { supabase, id: data.user.id };
}

export async function updateProfile(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = profileSchema.safeParse(formObject(fd));
  if (!parsed.success) return { error: "Vérifiez le formulaire", fieldErrors: fieldErrors(parsed.error) };
  const { supabase, id } = await uid();
  const { error } = await supabase.from("profiles").update({
    full_name: parsed.data.full_name, phone: parsed.data.phone ?? null,
    preferred_region_id: parsed.data.preferred_region_id ?? null, preferred_commune_id: parsed.data.preferred_commune_id ?? null,
    notify_in_app: parsed.data.notify_in_app,
  }).eq("id", id);
  if (error) return { error: humanizeError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Profil enregistré." };
}

export async function addAddress(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = addressSchema.safeParse(formObject(fd));
  if (!parsed.success) return { error: "Vérifiez l'adresse", fieldErrors: fieldErrors(parsed.error) };
  const { supabase, id } = await uid();
  const { count } = await supabase.from("customer_addresses").select("id", { count: "exact", head: true }).eq("user_id", id);
  if ((count ?? 0) >= 10) return { error: "10 adresses maximum." };
  const { error } = await supabase.from("customer_addresses").insert({
    user_id: id, label: parsed.data.label, region_id: parsed.data.region_id, commune_id: parsed.data.commune_id ?? null,
    locality_id: parsed.data.locality_id ?? null, address_line: parsed.data.address_line, landmark: parsed.data.landmark || null,
    contact_phone: parsed.data.contact_phone, is_default: (count ?? 0) === 0,
  });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/compte");
  return { ok: true, message: "Adresse ajoutée." };
}

export async function deleteAddress(fd: FormData) {
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return;
  const { supabase } = await uid();
  await supabase.from("customer_addresses").delete().eq("id", id.data); // RLS : seulement ses propres adresses
  revalidatePath("/compte");
}

export async function markAllNotificationsRead() {
  const { supabase, id } = await uid();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", id).is("read_at", null);
  revalidatePath("/", "layout");
}

export async function deleteAccount(_: ActionState, fd: FormData): Promise<ActionState> {
  if (fd.get("confirm") !== "SUPPRIMER") return { error: "Tapez SUPPRIMER pour confirmer." };
  const { supabase, id } = await uid();
  const { error } = await supabase.rpc("request_account_deletion");
  if (error) return { error: humanizeError(error) };
  // Suppression de l'identifiant de connexion si la clé de service est configurée ;
  // sinon le profil reste anonymisé et l'accès est bloqué (deleted_at).
  const admin = createServiceClient();
  if (admin) await admin.auth.admin.deleteUser(id, true);
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/?compte=supprime");
}

export async function applyAsCourier(_: ActionState, fd: FormData): Promise<ActionState> {
  const { normalizePhone } = await import("@/lib/format");
  const phone = normalizePhone(String(fd.get("phone") ?? ""));
  if (!phone) return { error: "Numéro de téléphone invalide", fieldErrors: { phone: "Format attendu : +223 70 00 00 00" } };
  const vehicle = String(fd.get("vehicle") ?? "moto");
  const region = String(fd.get("region") ?? "") || null;
  const commune = String(fd.get("commune") ?? "") || null;
  const { supabase } = await uid();
  const { error } = await supabase.rpc("courier_apply", { p_phone: phone, p_vehicle: vehicle, p_region: region, p_commune: commune });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/livraison");
  return { ok: true, message: "Candidature envoyée. L'équipe vérifiera votre identité avant activation." };
}

export async function setCourierAvailability(fd: FormData) {
  const { supabase, id } = await uid();
  await supabase.from("couriers").update({ is_available: fd.get("available") === "true" }).eq("user_id", id);
  revalidatePath("/livraison");
}

export async function reportIncident(_: ActionState, fd: FormData): Promise<ActionState> {
  const delivery = z.uuid().safeParse(fd.get("delivery_id"));
  const kind = z.enum(["client_absent", "adresse_introuvable", "colis_endommage", "refus_client", "securite", "autre"]).safeParse(fd.get("kind"));
  if (!delivery.success || !kind.success) return { error: "Requête invalide" };
  const { supabase } = await uid();
  const { error } = await supabase.rpc("report_delivery_incident", { p_delivery: delivery.data, p_kind: kind.data, p_description: String(fd.get("description") ?? "").slice(0, 500) });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/livraison", "layout");
  return { ok: true, message: "Incident signalé à l'équipe." };
}
