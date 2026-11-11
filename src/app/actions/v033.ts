"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { normalizePhone } from "@/lib/format";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const refresh = (id: string) => { revalidatePath("/admin/centres"); revalidatePath("/centres-specialises"); revalidatePath(`/centres-specialises/etablissement/${id}`); };

export async function saveFacilityDetails(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return { error: "Établissement invalide." };
  const phones: Record<string, string | null> = {};
  for (const k of ["phone", "phone2"]) {
    const raw = str(fd, k);
    phones[k] = raw ? normalizePhone(raw) : null;
    if (raw && !phones[k]) return { error: "Numéro de téléphone invalide.", fieldErrors: { [k]: "Invalide" } };
  }
  const lat = str(fd, "latitude"), lng = str(fd, "longitude");
  if ((lat === "") !== (lng === "")) return { error: "Renseignez la latitude et la longitude ensemble (ou aucune)." };
  if (lat && fd.get("gps_checked") !== "on") return { error: "Cochez la case confirmant que la position GPS a été vérifiée sur place ou auprès d'une source fiable." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_facility_details", { p_id: id.data, p: {
    kind: str(fd, "kind"), ownership: str(fd, "ownership"), quarter: str(fd, "quarter"), health_district: str(fd, "health_district"), address: str(fd, "address"),
    phone: phones.phone, phone2: phones.phone2, email: str(fd, "email"), website: str(fd, "website"), hours: str(fd, "hours"), access_conditions: str(fd, "access_conditions"),
    latitude: lat, longitude: lng, source_url: str(fd, "source_url"), to_verify: str(fd, "to_verify"),
    is_reference: fd.get("is_reference") === "on", reference_source: str(fd, "reference_source"),
  } });
  if (error) return { error: humanizeError(error) };
  refresh(id.data);
  return { ok: true, message: "Fiche enregistrée. Si elle était « vérifiée », elle repasse « à confirmer » : refaites la vérification." };
}

export async function setFacilityReliability(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  const level = z.enum(["verifie", "a_confirmer", "incomplet"]).safeParse(str(fd, "reliability"));
  if (!id.success || !level.success) return { error: "Requête invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_facility_reliability", { p_id: id.data, p_reliability: level.data, p_note: str(fd, "note").slice(0, 200) });
  if (error) return { error: humanizeError(error) };
  refresh(id.data);
  return { ok: true, message: level.data === "verifie" ? "Fiche marquée « Vérifié »." : "Niveau de fiabilité enregistré." };
}
