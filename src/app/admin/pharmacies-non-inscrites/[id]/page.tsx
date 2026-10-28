import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getGeo } from "@/lib/geo";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ListingFormFields } from "@/components/listing-form-fields";
import { deleteListing, linkListing, saveListing, setListingPublished } from "@/app/actions/listings";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Fiche pharmacie non inscrite" };
const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function AdminListing({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: l }, { data: matches }, geo] = await Promise.all([
    supabase.from("pharmacy_listings").select("*, pharmacies:claimed_pharmacy_id(id, name)").eq("id", id).maybeSingle(),
    supabase.rpc("admin_listing_matches", { p_id: id }),
    getGeo(),
  ]);
  if (!l) notFound();
  const claimed = one(l.pharmacies as { id: string; name: string } | { id: string; name: string }[] | null);
  const sugg = (matches as { id: string; name: string; commune_name: string | null; similarity: number }[] | null) ?? [];

  return (
    <div className="space-y-4">
      <Link prefetch={false} href="/admin/pharmacies-non-inscrites" className="text-sm text-primary underline">← Pharmacies non inscrites</Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">{l.name}</h1>
        {claimed ? <Badge className="border-emerald-200 bg-emerald-50 text-emerald-900">Rattachée</Badge>
          : l.is_published ? <Badge className="border-primary/30 bg-accent text-brand-deep">Publiée</Badge> : <Badge className="bg-muted">Masquée</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">Source : {l.source} · ajoutée le {formatDateTime(l.created_at)} · modifiée le {formatDateTime(l.updated_at)}</p>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="min-w-0">
          <CardHeader><CardTitle>Informations</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={saveListing} className="space-y-3">
              <ListingFormFields geo={geo} v={l} />
              <SubmitButton>Enregistrer</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pharmacie inscrite correspondante</CardTitle>
              <CardDescription>Quand cette officine s&apos;inscrit et est vérifiée, rattachez-la : la fiche d&apos;annuaire disparaît au profit de la vraie fiche (stocks, commandes).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {claimed ? (
                <>
                  <p className="text-sm">Rattachée à <Link prefetch={false} href={`/admin/pharmacies/${claimed.id}`} className="font-semibold text-primary underline">{claimed.name}</Link>.</p>
                  <ActionForm action={linkListing}>
                    <input type="hidden" name="id" value={l.id} /><input type="hidden" name="pharmacy_id" value="" />
                    <SubmitButton variant="outline" size="sm">Annuler le rattachement</SubmitButton>
                  </ActionForm>
                </>
              ) : sugg.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune pharmacie vérifiée au nom proche dans cette région.</p>
              ) : (
                <ul className="space-y-2">
                  {sugg.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                      <div className="min-w-0 text-sm">
                        <Link prefetch={false} href={`/admin/pharmacies/${m.id}`} className="font-semibold hover:underline">{m.name}</Link>
                        <p className="text-xs text-muted-foreground">{m.commune_name ?? "—"} · ressemblance {Math.round(m.similarity * 100)} %</p>
                      </div>
                      <ActionForm action={linkListing}>
                        <input type="hidden" name="id" value={l.id} /><input type="hidden" name="pharmacy_id" value={m.id} />
                        <SubmitButton size="sm" confirm={`Rattacher cette fiche à « ${m.name} » ?`}>Rattacher</SubmitButton>
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Publication</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <ActionForm action={setListingPublished}>
                <input type="hidden" name="id" value={l.id} />
                <input type="hidden" name="published" value={l.is_published ? "false" : "true"} />
                <SubmitButton variant="outline">{l.is_published ? "Masquer du public" : "Publier"}</SubmitButton>
              </ActionForm>
              <ActionForm action={deleteListing}>
                <input type="hidden" name="id" value={l.id} />
                <SubmitButton variant="destructive" confirm="Supprimer définitivement cette fiche ?">Supprimer la fiche</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
