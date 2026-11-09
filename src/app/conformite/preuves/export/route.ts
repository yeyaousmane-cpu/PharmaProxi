import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DECISION, METHOD, parseFilters, type ProofRow } from "@/lib/compliance";

const cell = (v: unknown) => { const s = String(v ?? "").replace(/"/g, '""'); return /^[=+\-@]/.test(s) ? `"'${s}"` : `"${s}"`; };

/** Export CSV des preuves (journalisé comme « compliance.export »). */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const { data, error } = await supabase.rpc("compliance_search", { ...parseFilters(sp), p_export: true });
  if (error) return new NextResponse("Accès refusé.", { status: 403 });
  const rows = (data as ProofRow[] | null) ?? [];
  const head = ["numero", "date_utc", "fuseau_declare", "personne_id", "personne", "finalite", "choix", "version_texte", "version_politique", "langue", "canal", "empreinte_sha256", "texte_verifie"];
  const lines = rows.map((r) => [r.id, r.created_at, r.timezone, r.user_id, r.user_name, r.purpose_title, DECISION[r.decision] ?? r.decision, r.purpose_version, r.policy_version, r.lang,
    METHOD[r.method] ?? r.method, r.text_sha256, r.text_sha256 ? (r.text_ok ? "oui" : "NON") : "avant v0.26"].map(cell).join(";"));
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse("﻿" + [head.join(";"), ...lines].join("\r\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="preuves-consentement-${day}.csv"`, "cache-control": "no-store" },
  });
}
