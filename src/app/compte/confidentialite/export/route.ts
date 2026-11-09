import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Tables exportées et colonne qui désigne l'utilisateur. La lecture passe par les règles d'accès (RLS) : seules ses propres lignes sortent. */
const TABLES: [string, string][] = [
  ["profiles", "id"], ["customer_addresses", "user_id"], ["appointments", "patient_id"], ["appointment_waitlist", "user_id"],
  ["orders", "customer_id"], ["notifications", "user_id"], ["medicine_alerts", "user_id"], ["user_alert_prefs", "user_id"],
  ["health_measures", "user_id"], ["treatments", "user_id"], ["record_documents", "user_id"], ["record_settings", "user_id"],
  ["lab_results", "user_id"], ["home_sampling_requests", "user_id"], ["children", "user_id"], ["patient_relatives", "user_id"],
  ["pharmacist_questions", "user_id"], ["feedback", "user_id"], ["consent_records", "user_id"], ["privacy_requests", "user_id"],
];

/** Export de ses propres données au format JSON (droit d'accès et de portabilité). */
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return new NextResponse("Connectez-vous pour télécharger vos données.", { status: 401 });
  const out: Record<string, unknown> = {
    _a_propos: {
      service: "SantéProxi", genere_le: new Date().toISOString(),
      contenu: "Données associées à votre compte, telles qu'enregistrées. Les notes de l'espace Femme sont chiffrées et s'exportent depuis cet espace. Les fichiers des documents médicaux se téléchargent depuis votre dossier santé.",
    },
    compte: { id: user.id, email: user.email ?? null, telephone: user.phone ?? null, cree_le: user.created_at },
  };
  for (const [table, col] of TABLES) {
    const { data, error } = await supabase.from(table).select("*").eq(col, user.id).limit(5000);
    out[table] = error ? { indisponible: true } : data;
  }
  const { data: events } = await supabase.rpc("my_audit_events", { p_limit: 200 });
  out.historique = events ?? [];
  await supabase.rpc("log_privacy_event", { p_action: "privacy.export" });
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="santeproxi-mes-donnees-${day}.json"`,
      "cache-control": "no-store",
    },
  });
}
