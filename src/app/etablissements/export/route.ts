import { createClient } from "@/lib/supabase/server";
import { DIRECTORY_KINDS, DIRECTORY_SERVICES, type DirectoryRow } from "@/lib/national-directory";

export const dynamic = "force-dynamic";
const uuid = (s: string | null) => (s && /^[0-9a-f-]{36}$/.test(s) ? s : null);
const cell = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Export CSV des fiches publiques de l'annuaire (mêmes filtres que la page). Aucune donnée personnelle : uniquement
 *  les informations publiques des établissements et le niveau de fiabilité. */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const kind = u.get("type"); const service = u.get("service"); const level = u.get("fiabilite");
  const supabase = await createClient();
  const rows: DirectoryRow[] = [];
  for (let off = 0; off < 3000; off += 100) {
    const { data, error } = await supabase.rpc("directory_search", { p_q: u.get("q")?.slice(0, 120) || null, p_region: uuid(u.get("region")), p_circle: uuid(u.get("cercle")),
      p_commune: uuid(u.get("commune")), p_kind: kind && kind in DIRECTORY_KINDS ? kind : null, p_service: service && service in DIRECTORY_SERVICES ? service : null,
      p_has_phone: u.get("tel") === "1" || null, p_level: ["verifie", "officielle", "a_confirmer"].includes(level ?? "") ? level : null, p_geo: u.get("gps") === "1" || null, p_limit: 100, p_offset: off });
    if (error) return new Response("Export indisponible", { status: 500 });
    rows.push(...((data ?? []) as DirectoryRow[]));
    if (!data || data.length < 100) break;
  }
  const head = ["id", "nom", "type", "categorie", "statut", "region", "cercle", "commune", "localite", "quartier", "adresse", "telephone", "telephone_2", "whatsapp", "email", "site_web",
    "latitude", "longitude", "urgences", "niveau_source", "activite", "statut_contacts", "verification_santeproxi", "date_verification", "offre_confirmee", "fiche"];
  const lines = rows.map((r) => [r.id, r.name, r.kind, r.category_label, r.ownership, r.region, r.circle, r.commune, r.locality, r.quarter, r.address, r.phone, r.phone2, r.whatsapp, r.email,
    r.website, r.latitude, r.longitude, r.emergency_24h ? "oui" : "", r.source_level, r.operating_status, r.contacts_status, r.reliability, r.verified_at,
    r.offers.map((o) => o.label).join(" | "), `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/etablissements/${r.id}`].map(cell).join(";"));
  const body = "﻿" + [head.join(";"), ...lines].join("\r\n");
  return new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="santeproxi-etablissements-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" } });
}
