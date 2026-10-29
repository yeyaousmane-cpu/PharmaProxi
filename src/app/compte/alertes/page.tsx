import Link from "next/link";
import { BellRing } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Badge } from "@/components/ui/badge";
import { deleteAlert } from "@/app/actions/services";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Mes alertes" };

type One<T> = T | T[] | null;
const one = <T,>(v: One<T>) => (Array.isArray(v) ? v[0] : v);

export default async function AlertsPage() {
  const s = await requireUser("/compte/alertes");
  const supabase = await createClient();
  const { data } = await supabase.from("medicine_alerts")
    .select("id, catalog_id, created_at, expires_at, notified_at, medicine_catalog(brand_name, dosage, form), regions(name), communes(name)")
    .eq("user_id", s.userId).order("created_at", { ascending: false });
  const now = Date.now();
  return (
    <div className="container-page max-w-3xl space-y-4 py-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold"><BellRing className="size-6" aria-hidden /> Mes alertes de disponibilité</h1>
      <p className="text-sm text-muted-foreground">
        Quand un produit est introuvable, ouvrez sa fiche et choisissez « M&apos;alerter ». Vous recevez une notification dès qu&apos;une pharmacie vérifiée
        le déclare disponible. Une disponibilité reste une déclaration : appelez la pharmacie ou demandez une confirmation avant de vous déplacer.
      </p>
      {!data?.length ? (
        <p className="rounded-xl border border-dashed bg-white p-6 text-center text-sm text-muted-foreground">
          Aucune alerte. <Link prefetch={false} href="/recherche" className="font-semibold text-primary underline">Rechercher un médicament</Link>
        </p>
      ) : (
        <ul className="divide-y rounded-xl border bg-white">
          {data.map((a) => {
            const m = one(a.medicine_catalog);
            const zone = [one(a.communes)?.name, one(a.regions)?.name].filter(Boolean).join(", ") || "Tout le Mali";
            const expired = new Date(a.expires_at).getTime() < now;
            return (
              <li key={a.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Link prefetch={false} href={`/produits/${a.catalog_id}`} className="font-semibold hover:underline">{[m?.brand_name, m?.dosage, m?.form].filter(Boolean).join(" ")}</Link>
                  <p className="text-xs text-muted-foreground">{zone} · créée le {formatDate(a.created_at)}</p>
                  <div className="mt-1">
                    {a.notified_at ? <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">Disponibilité signalée le {formatDate(a.notified_at)}</Badge>
                      : expired ? <Badge className="bg-muted text-muted-foreground">Expirée</Badge>
                      : <Badge className="border-amber-200 bg-amber-50 text-amber-900">En attente · jusqu&apos;au {formatDate(a.expires_at)}</Badge>}
                  </div>
                </div>
                <ActionForm action={deleteAlert}>
                  <input type="hidden" name="id" value={a.id} />
                  <SubmitButton size="sm" variant="outline">Supprimer</SubmitButton>
                </ActionForm>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
