import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

export type MyPharmacy = { id: string; name: string; status: "pending" | "verified" | "rejected" | "suspended"; is_demo: boolean };

export const PHARMACY_COOKIE = "pp_pharmacy";

/** Pharmacies dont l'utilisateur est membre (lecture soumise à la RLS). */
export const getMyPharmacies = cache(async (): Promise<MyPharmacy[]> => {
  const s = await requireUser("/pharmacien");
  const supabase = await createClient();
  const { data } = await supabase.from("pharmacy_members").select("pharmacies(id, name, status, is_demo)").eq("user_id", s.userId);
  return (data ?? [])
    .map((r) => (Array.isArray(r.pharmacies) ? r.pharmacies[0] : r.pharmacies) as MyPharmacy | null)
    .filter((p): p is MyPharmacy => Boolean(p))
    .sort((a, b) => a.name.localeCompare(b.name));
});

/** Pharmacie active (cookie de sélection, sinon la première). Redirige vers l'inscription si aucune. */
export async function requireCurrentPharmacy(): Promise<MyPharmacy> {
  const list = await getMyPharmacies();
  if (list.length === 0) redirect("/pharmacien/inscription");
  const chosen = (await cookies()).get(PHARMACY_COOKIE)?.value;
  return list.find((p) => p.id === chosen) ?? list[0];
}

export const PHARMACY_STATUS_LABEL: Record<MyPharmacy["status"], string> = {
  pending: "En attente de vérification",
  verified: "Vérifiée",
  rejected: "Demande refusée",
  suspended: "Suspendue",
};
