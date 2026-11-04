import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { openFile } from "@/lib/health-crypto";

/** Ouvre un document personnel : réservé au titulaire, et seulement si son dossier est déverrouillé. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Introuvable", { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/connexion?suite=/ma-sante/dossier/documents", req.url));
  const { data: st } = await supabase.rpc("record_status");
  if ((st as { locked?: boolean } | null)?.locked) return NextResponse.redirect(new URL("/ma-sante/dossier/documents", req.url));
  const { data: d } = await supabase.from("record_documents").select("storage_path, mime, title").eq("id", id).maybeSingle();
  if (!d) return new NextResponse("Introuvable", { status: 404 });
  const { data: blob, error } = await supabase.storage.from("personal-documents").download(d.storage_path);
  if (error || !blob) return new NextResponse("Fichier indisponible", { status: 404 });
  let body: Buffer;
  try { body = openFile(Buffer.from(await blob.arrayBuffer())); } catch { return new NextResponse("Fichier illisible", { status: 500 }); }
  return new NextResponse(new Uint8Array(body), { headers: { "Content-Type": d.mime, "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
