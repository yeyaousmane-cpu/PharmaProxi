import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { openFile } from "@/lib/health-crypto";

/** Fichier d'un examen partagé : réservé au médecin désigné, tant que le partage est actif ; chaque ouverture est journalisée. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ grant: string }> }) {
  const { grant } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(grant)) return new NextResponse("Introuvable", { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Connexion requise", { status: 401 });
  const { data, error } = await supabase.rpc("imaging_open", { p_grant: grant });
  if (error || !data) return new NextResponse("Accès expiré ou retiré", { status: 403 });
  const d = data as { storage_path: string; mime: string };
  const { data: blob, error: dlErr } = await supabase.storage.from("personal-documents").download(d.storage_path);
  if (dlErr || !blob) return new NextResponse("Fichier indisponible", { status: 404 });
  let body: Buffer;
  try { body = openFile(Buffer.from(await blob.arrayBuffer())); } catch { return new NextResponse("Fichier illisible", { status: 500 }); }
  return new NextResponse(new Uint8Array(body), { headers: { "Content-Type": d.mime, "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex" } });
}
