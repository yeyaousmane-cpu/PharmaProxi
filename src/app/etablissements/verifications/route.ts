import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const PRECISION: Record<string, string> = {
  confirmee: "position relevée sur place",
  a_confirmer: "position non vérifiée",
  approximative: "position approximative (coordonnée partagée avec d'autres fiches)",
  inconnue: "aucune position",
};

type Row = {
  id: string; name: string; kind: string; quarter: string | null; address: string | null;
  phone: string | null; is_published: boolean; reliability: string; operating_status: string;
  contacts_status: string; source: string; source_level: string; source_date: string | null;
  verified_at: string | null; to_verify: string | null; position_precision: string;
  latitude: number | null; longitude: number | null;
  regions: { name: string } | null; communes: { name: string } | null;
};

/** Export CSV du reliquat de vérification de l'annuaire : ce qui reste à confirmer sur chaque
 *  fiche, son statut de publication et la fiabilité de sa position.
 *
 *  Aucune donnée personnelle. La RLS décide de ce qui est visible : un administrateur connecté
 *  voit aussi les fiches en attente de publication, un visiteur seulement les fiches publiées. */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const onlyPending = u.get("attente") === "1";
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("facility_listings")
    .select(
      "id, name, kind, quarter, address, phone, is_published, reliability, operating_status, contacts_status, source, source_level, source_date, verified_at, to_verify, position_precision, latitude, longitude, regions(name), communes(name)"
    )
    .or("to_verify.not.is.null,is_published.eq.false")
    .order("is_published", { ascending: true })
    .order("name")
    .limit(3000);

  if (error) return new Response("Export indisponible", { status: 500 });

  const rows = ((data ?? []) as unknown as Row[]).filter((r) => (onlyPending ? !r.is_published : true));

  const head = [
    "id", "nom", "type", "region", "commune", "quartier", "adresse", "telephone",
    "publie", "fiabilite", "activite", "contacts", "precision_position",
    "source", "niveau_source", "date_source", "date_verification",
    "a_verifier_avant_publication", "fiche",
  ];

  const lines = rows.map((r) =>
    [
      r.id, r.name, r.kind, r.regions?.name ?? "", r.communes?.name ?? "", r.quarter, r.address, r.phone,
      r.is_published ? "oui" : "non", r.reliability, r.operating_status, r.contacts_status,
      PRECISION[r.position_precision] ?? r.position_precision,
      r.source, r.source_level, r.source_date, r.verified_at, r.to_verify,
      `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/etablissements/${r.id}`,
    ]
      .map(cell)
      .join(";")
  );

  const body = "﻿" + [head.join(";"), ...lines].join("\r\n");
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="santeproxi-verifications-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
