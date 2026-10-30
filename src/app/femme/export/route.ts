import { createClient } from "@/lib/supabase/server";
import { openNote } from "@/lib/femme/crypto";

/** Export de toutes les données de l'espace (fichier JSON), notes déchiffrées pour l'utilisatrice. */
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("femme_export");
  if (error || !data) return new Response("Export impossible : espace verrouillé ou non activé.", { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });
  const out = data as { journal?: { note?: string | null }[] };
  for (const d of out.journal ?? []) if (d.note) d.note = openNote(d.note);
  return new Response(JSON.stringify(out, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="mon-espace-pharmaproxi-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
