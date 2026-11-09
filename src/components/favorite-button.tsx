import { Heart } from "lucide-react";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { toggleFavorite } from "@/app/actions/v026";

/** Ajoute ou retire un professionnel / établissement des favoris de la personne connectée. */
export async function FavoriteButton({ kind, targetId, label, href }: { kind: "medecin" | "pharmacie" | "etablissement" | "laboratoire"; targetId: string; label: string; href: string }) {
  const session = await getSession();
  if (!session) return <Link prefetch={false} href={`/connexion?suite=${encodeURIComponent(href)}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold"><Heart className="size-4" aria-hidden /> Ajouter aux favoris</Link>;
  const supabase = await createClient();
  const { data } = await supabase.from("favorites").select("target_id").eq("kind", kind).eq("target_id", targetId).maybeSingle();
  const on = Boolean(data);
  return (
    <ActionForm action={toggleFavorite}>
      <input type="hidden" name="kind" value={kind} /><input type="hidden" name="target" value={targetId} /><input type="hidden" name="label" value={label} />
      <input type="hidden" name="href" value={href} /><input type="hidden" name="on" value={on ? "1" : "0"} />
      <SubmitButton size="sm" variant="outline" aria-pressed={on}><Heart className={`size-4 ${on ? "fill-red-600 text-red-600" : ""}`} aria-hidden /> {on ? "Dans mes favoris" : "Ajouter aux favoris"}</SubmitButton>
    </ActionForm>
  );
}
