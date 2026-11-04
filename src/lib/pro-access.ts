import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ProKind = "pharmacie" | "medecin" | "clinique";

/** L'administrateur a-t-il autorisé ce compte à inscrire ce type d'établissement ? */
export async function hasProAuthorization(kind: ProKind) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("has_pro_authorization", { p_kind: kind });
  return data === true;
}
