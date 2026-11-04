import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";

const KINDS = ["pharmacie", "medecin", "clinique", "laboratoire", "etablissement"];
const EVENTS = ["call", "directions"];

/** Compte un appel ou un itinéraire depuis une fiche publique : un simple compteur par jour, sans aucune donnée personnelle. */
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as { k?: string; id?: string; e?: string } | null;
  if (!b || !KINDS.includes(b.k ?? "") || !EVENTS.includes(b.e ?? "") || !/^[0-9a-f-]{36}$/i.test(b.id ?? "")) return new NextResponse(null, { status: 204 });
  if (!rateLimit(`evt:${await clientIp()}:${b.id}:${b.e}`, 3, 10 * 60_000)) return new NextResponse(null, { status: 204 });
  const supabase = await createClient();
  await supabase.rpc("track_listing_event", { p_kind: b.k, p_id: b.id, p_event: b.e });
  return new NextResponse(null, { status: 204 });
}
