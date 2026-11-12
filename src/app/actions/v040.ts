"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { requireUser } from "@/lib/auth";

const uuid = z.uuid();
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const KEYS = ["organization_name", "organization_kind", "contact_phone", "title", "region_id", "place", "starts_on", "start_time", "end_time", "expected_donors", "collecting_structure", "collecting_agreement", "details", "slot_minutes", "slot_capacity"];

export async function proposeCampaign(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("/don-de-sang/collectes/organiser");
  if (fd.get("engagement") !== "on") return { error: "Cochez l'engagement de l'organisateur.", fieldErrors: { engagement: "Obligatoire" } };
  const p = Object.fromEntries(KEYS.map((k) => [k, str(fd, k)]));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("campaign_propose", { p });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/don-de-sang/collectes/organiser");
  return { ok: true, message: `Proposition ${data} envoyée. Le CNTS ou l'équipe SantéProxi la vérifie avant toute publication.` };
}

export async function withdrawCampaign(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("/don-de-sang/collectes/organiser");
  const id = uuid.safeParse(fd.get("id")); if (!id.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("campaign_withdraw", { p_id: id.data });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/don-de-sang/collectes/organiser");
  return { ok: true, message: "Proposition retirée." };
}

export async function reportCampaignOutcome(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("/don-de-sang/collectes/organiser");
  const id = uuid.safeParse(fd.get("id")); if (!id.success) return { error: "Requête invalide" };
  const n = (k: string) => (/^\d{1,5}$/.test(str(fd, k)) ? Number(str(fd, k)) : NaN);
  if (Number.isNaN(n("present")) || Number.isNaN(n("collected"))) return { error: "Indiquez des nombres entiers." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("campaign_report_outcome", { p_id: id.data, p_present: n("present"), p_collected: n("collected"), p_note: str(fd, "note").slice(0, 500) || null });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/don-de-sang/collectes/organiser");
  return { ok: true, message: "Bilan enregistré (déclaré par l'organisateur)." };
}

export async function reviewCampaign(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("/don-de-sang/collectes/validation");
  const id = uuid.safeParse(fd.get("id")); const decision = str(fd, "decision");
  if (!id.success || !["validee", "a_completer", "refusee"].includes(decision)) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("campaign_review", { p_id: id.data, p_decision: decision, p_note: str(fd, "note").slice(0, 500) || null });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/don-de-sang/collectes/validation"); revalidatePath("/don-de-sang/collectes"); revalidatePath("/don-de-sang");
  return { ok: true, message: decision === "validee" ? "Collecte validée et publiée." : "Réponse envoyée à l'organisateur." };
}

export async function bookCampaignSlot(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("campaign_id"));
  await requireUser(`/don-de-sang/collectes/${id.success ? id.data : ""}`);
  if (!id.success) return { error: "Requête invalide" };
  const slot = str(fd, "slot"); const supabase = await createClient();
  const { error } = slot === "annuler" ? await supabase.rpc("campaign_cancel_slot", { p_campaign: id.data }) : await supabase.rpc("campaign_book_slot", { p_campaign: id.data, p_slot: slot });
  if (error) return { error: humanizeError(error) };
  revalidatePath(`/don-de-sang/collectes/${id.data}`);
  return { ok: true, message: slot === "annuler" ? "Créneau libéré." : `Créneau de ${slot} réservé. Pensez à manger avant de venir et à apporter une pièce d'identité.` };
}
