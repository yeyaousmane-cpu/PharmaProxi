import "server-only";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";

/** API publique en lecture seule : uniquement des données déjà publiques sur le site. */
export const API_VERSION = "1.0";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };

export async function guard(name: string): Promise<NextResponse | null> {
  if (!rateLimit(`api:${name}:${await clientIp()}`, 60, 60_000)) return json({ error: "Trop de requêtes : 60 par minute au maximum." }, 429);
  return null;
}
export function json(body: unknown, status = 200, maxAge = 120) {
  return NextResponse.json(body, { status, headers: { ...CORS, "Cache-Control": status === 200 ? `public, max-age=${maxAge}, stale-while-revalidate=600` : "no-store", "X-SantéProxi-API": API_VERSION } });
}
export const options = () => new NextResponse(null, { status: 204, headers: CORS });
export const uuidOrNull = (v: string | null) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
export function num(v: string | null, min: number, max: number, def: number) {
  const n = Number(v); return Number.isFinite(n) && v !== null && v !== "" ? Math.min(max, Math.max(min, Math.trunc(n))) : def;
}
export function coord(v: string | null, lim: number) { const n = Number(v); return v && Number.isFinite(n) && Math.abs(n) <= lim ? n : null; }
export const LICENSE = "Données publiques de l'annuaire SantéProxi. Réutilisation autorisée en citant « SantéProxi » et la date de consultation. Les disponibilités et prix doivent être confirmés auprès de l'établissement.";
