"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const phone = z.string().regex(/^[0-9+ ]{3,20}$/, "Numéro invalide (chiffres, espaces et + uniquement).");

const contact = z.object({
  country: z.string().regex(/^[A-Z]{2}$/, "Code pays sur 2 lettres (ex. ML)."),
  region: z.string().max(80).nullable(),
  name: z.string().min(2, "Nom du service obligatoire.").max(120),
  mission: z.string().max(300).nullable(),
  phone,
  phone_alt: phone.nullable(),
  tier: z.enum(["principal", "complementaire"]),
  icon: z.enum(["sante", "protection_civile", "police", "gendarmerie", "crise", "garde", "ambulance", "autre"]),
  status: z.enum(["a_verifier", "verifie", "a_actualiser"]),
  source_url: z.string().regex(/^https:\/\//, "La source doit être une adresse https://").nullable(),
  source_note: z.string().max(200).nullable(),
  verified_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  sort: z.coerce.number().int().min(0).max(9999),
  active: z.boolean(),
});

function read(fd: FormData) {
  const opt = (k: string) => str(fd, k) || null;
  const clean = (k: string) => { const v = str(fd, k).replace(/\s+/g, ""); return v || null; };
  const parsed = contact.safeParse({
    country: (str(fd, "country") || "ML").toUpperCase(), region: opt("region"), name: str(fd, "name"), mission: opt("mission"),
    phone: clean("phone") ?? "", phone_alt: clean("phone_alt"), tier: str(fd, "tier") || "principal", icon: str(fd, "icon") || "autre",
    status: str(fd, "status") || "a_verifier", source_url: opt("source_url"), source_note: opt("source_note"), verified_at: opt("verified_at"),
    sort: str(fd, "sort") || "100", active: fd.get("active") === "on" || fd.get("active") === "1",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." } as const;
  const row = parsed.data;
  if (row.status === "verifie" && !row.verified_at) row.verified_at = new Date().toISOString().slice(0, 10);
  if (row.status === "verifie" && !row.source_url && !row.source_note) return { error: "Un numéro « vérifié » doit avoir une source (lien officiel ou note de vérification)." } as const;
  return { row } as const;
}

function refresh() { revalidatePath("/admin/urgences"); revalidatePath("/sos"); }

export async function saveEmergencyContact(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = read(fd);
  if ("error" in r) return { error: r.error };
  const id = z.uuid().safeParse(fd.get("id"));
  const supabase = await createClient();
  const { error } = id.success
    ? await supabase.from("emergency_contacts").update(r.row).eq("id", id.data)
    : await supabase.from("emergency_contacts").insert(r.row);
  if (error) return { error: error.code === "23505" ? "Ce numéro existe déjà pour ce pays." : humanizeError(error) };
  refresh();
  return { ok: true, message: id.success ? "Contact mis à jour." : "Contact ajouté." };
}

export async function deleteEmergencyContact(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return { error: "Élément invalide" };
  const supabase = await createClient();
  const { error } = await supabase.from("emergency_contacts").delete().eq("id", id.data);
  if (error) return { error: humanizeError(error) };
  refresh();
  return { ok: true, message: "Contact supprimé." };
}
