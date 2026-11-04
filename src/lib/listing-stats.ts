import "server-only";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Compte une consultation de fiche (après l'envoi de la page, sans ralentir l'affichage). */
export function trackView(kind: "pharmacie" | "medecin" | "clinique" | "laboratoire" | "etablissement", id: string) {
  after(async () => {
    try {
      const supabase = await createClient();
      await supabase.rpc("track_listing_event", { p_kind: kind, p_id: id, p_event: "view" });
    } catch { /* statistiques : jamais bloquant */ }
  });
}
