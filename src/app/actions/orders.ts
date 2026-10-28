"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { setFlash } from "@/lib/flash";
import { humanizeError, type ActionState } from "@/lib/errors";

const createSchema = z.object({
  pharmacy_id: z.uuid(),
  fulfillment: z.enum(["pickup", "delivery"]),
  idempotency_key: z.string().min(8).max(80),
  address_id: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  note: z.string().max(500).optional(),
  instructions: z.string().max(300).optional(),
});

/** Demande de confirmation / réservation (création de commande idempotente). */
export async function createOrder(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = createSchema.safeParse(Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) return { error: "Formulaire invalide" };
  const items: { inventory_id: string; quantity: number }[] = [];
  for (const id of fd.getAll("item")) {
    const q = Number(fd.get(`qty_${id}`) ?? 1);
    if (typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)) items.push({ inventory_id: id, quantity: Math.trunc(q) });
  }
  if (items.length === 0) return { error: "Sélectionnez au moins un produit." };
  if (parsed.data.fulfillment === "delivery" && !parsed.data.address_id) return { error: "Choisissez une adresse de livraison." };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/connexion?suite=/pharmacies/${parsed.data.pharmacy_id}`);
  // Les limites de fréquence sont imposées en base (déclencheur orders_rate).

  const { data, error } = await supabase.rpc("create_order", {
    p_pharmacy: parsed.data.pharmacy_id,
    p_items: items,
    p_fulfillment: parsed.data.fulfillment,
    p_idempotency_key: parsed.data.idempotency_key,
    p_address_id: parsed.data.address_id ?? null,
    p_note: parsed.data.note ?? null,
    p_delivery_instructions: parsed.data.instructions ?? null,
  });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/compte/commandes");
  redirect(`/compte/commandes/${data}?nouvelle=1`);
}

const STATUSES = ["preparing", "ready_for_pickup", "awaiting_courier", "in_delivery", "delivered", "completed", "cancelled", "delivery_failed"] as const;

/** Changement de statut (droits vérifiés en base selon le rôle de l'utilisateur). */
export async function advanceOrder(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("order_id"));
  const to = z.enum(STATUSES).safeParse(fd.get("to"));
  if (!id.success || !to.success) return { error: "Requête invalide" };
  const note = String(fd.get("note") ?? "").trim() || null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("advance_order", { p_order: id.data, p_to: to.data, p_note: note });
  if (error) return { error: humanizeError(error) };
  if (fd.get("paid") === "on") {
    const { error: e2 } = await supabase.rpc("confirm_payment", { p_order: id.data });
    if (e2) return { error: `Statut mis à jour, mais paiement non enregistré : ${humanizeError(e2)}` };
  }
  await setFlash("Statut mis à jour.");
  revalidatePath("/", "layout");
  return { ok: true, message: "Statut mis à jour." };
}

export async function respondOrder(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("order_id"));
  if (!id.success) return { error: "Requête invalide" };
  const accept = fd.get("decision") === "accept";
  const reason = String(fd.get("reason") ?? "").trim() || null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pharmacy_respond_order", { p_order: id.data, p_accept: accept, p_reason: reason });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/", "layout");
  if (data === "expired") return { error: "Le délai de confirmation était dépassé : la demande a expiré." };
  const msg = accept ? "Commande confirmée : le stock est réservé." : "Demande refusée, le client est prévenu.";
  await setFlash(msg);
  return { ok: true, message: msg };
}

export async function confirmPayment(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("order_id"));
  if (!id.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_payment", { p_order: id.data });
  if (error) return { error: humanizeError(error) };
  await setFlash("Paiement reçu enregistré.");
  revalidatePath("/", "layout");
  return { ok: true, message: "Paiement reçu enregistré." };
}

const reportSchema = z.object({
  pharmacy_id: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  inventory_id: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  order_id: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  reason: z.enum(["stock_incorrect", "prix_incorrect", "pharmacie_fermee", "informations_erronees", "comportement", "produit_suspect", "autre"]),
  description: z.string().trim().max(1000).optional(),
});

export async function submitReport(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = reportSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: "Signalement invalide" };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Connectez-vous pour signaler un problème." };
  const { error } = await supabase.from("reports").insert({ ...parsed.data, reporter_id: auth.user.id });
  if (error) return { error: humanizeError(error) };
  return { ok: true, message: "Merci, votre signalement a été transmis à l'équipe PharmaProxi." };
}
