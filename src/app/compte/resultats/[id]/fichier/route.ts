import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { openFile } from "@/lib/health-crypto";

/** Déchiffre et affiche un résultat, pour le patient ou le laboratoire uniquement (contrôlé par la base). */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Introuvable", { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/connexion?suite=/compte/resultats`, _.url));
  const { data: r } = await supabase.from("lab_results").select("id, user_id, storage_path, mime, file_name").eq("id", id).maybeSingle();
  if (!r) return new NextResponse("Introuvable", { status: 404 });
  const { data: blob, error } = await supabase.storage.from("lab-results").download(r.storage_path);
  if (error || !blob) return new NextResponse("Fichier indisponible", { status: 404 });
  let body: Buffer;
  try { body = openFile(Buffer.from(await blob.arrayBuffer())); } catch { return new NextResponse("Fichier illisible", { status: 500 }); }
  if (r.user_id === user.id) await supabase.rpc("mark_result_opened", { p_id: id });
  return new NextResponse(new Uint8Array(body), { headers: {
    "Content-Type": r.mime, "Content-Disposition": `inline; filename="resultat-${id.slice(0, 8)}${r.mime === "application/pdf" ? ".pdf" : ""}"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}
