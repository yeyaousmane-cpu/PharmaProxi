import Link from "next/link";
import { Bike } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getGeo } from "@/lib/geo";
import { getSettings } from "@/lib/settings";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { LocationPicker } from "@/components/location-picker";
import { OrderStatusBadge } from "@/components/orders/order-bits";
import { applyAsCourier, setCourierAvailability } from "@/app/actions/account";
import { formatDateTime, formatPhone } from "@/lib/format";
import type { OrderStatus } from "@/lib/order-status";

export const metadata = { title: "Espace livraison" };
const ST: Record<string, string> = { pending: "Candidature en cours d'examen", verified: "Livreur vérifié", suspended: "Compte livreur suspendu", rejected: "Candidature refusée" };

export default async function CourierHome() {
  const s = await requireUser("/livraison");
  const supabase = await createClient();
  const [{ data: courier }, settings] = await Promise.all([
    supabase.from("couriers").select("status, phone, vehicle, is_available").eq("user_id", s.userId).maybeSingle(),
    getSettings(),
  ]);
  const isCourier = s.roles.includes("courier") && courier?.status === "verified";

  if (!isCourier) {
    const geo = await getGeo();
    return (
      <div className="container-page max-w-2xl space-y-4 py-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Bike className="size-6 text-brand-green" aria-hidden /> Devenir livreur</h1>
        {courier && <Alert tone={courier.status === "pending" ? "info" : "warning"} title={ST[courier.status]} />}
        {!settings.delivery_enabled && <Alert tone="info" title="La livraison n'est pas encore ouverte">Vous pouvez candidater dès maintenant ; vous serez contacté lors de l&apos;ouverture.</Alert>}
        {(!courier || courier.status === "rejected" || courier.status === "pending") && (
          <Card><CardHeader><CardTitle>Candidature</CardTitle><CardDescription>Votre identité sera vérifiée (pièce officielle) avant toute habilitation. Les livreurs ne transportent jamais de médicaments sur ordonnance.</CardDescription></CardHeader>
            <CardContent>
              <ActionForm action={applyAsCourier} className="space-y-3" labels={{ phone: "Téléphone" }}>
                <Field label="Téléphone" htmlFor="phone" required><Input id="phone" name="phone" type="tel" required defaultValue={formatPhone(courier?.phone)} /></Field>
                <Field label="Moyen de transport" htmlFor="vehicle"><Select id="vehicle" name="vehicle" defaultValue={courier?.vehicle ?? "moto"}>
                  <option value="moto">Moto</option><option value="velo">Vélo</option><option value="voiture">Voiture</option><option value="a_pied">À pied</option><option value="autre">Autre</option></Select></Field>
                <div><p className="mb-1 text-sm font-medium">Zone d&apos;intervention</p><LocationPicker geo={geo} names={{ region: "region", commune: "commune" }} /></div>
                <SubmitButton>{courier ? "Mettre à jour ma candidature" : "Envoyer ma candidature"}</SubmitButton>
              </ActionForm>
            </CardContent></Card>
        )}
      </div>
    );
  }

  const { data: assignments } = await supabase.from("delivery_assignments")
    .select("id, is_active, assigned_at, ended_at, deliveries(id, status, dropoff_address, orders(id, reference, status, pharmacies(name, address, phone)))")
    .eq("courier_id", s.userId).order("assigned_at", { ascending: false }).limit(50);
  const rows = (assignments ?? []).map((a) => {
    const d = Array.isArray(a.deliveries) ? a.deliveries[0] : a.deliveries;
    const o = d ? (Array.isArray(d.orders) ? d.orders[0] : d.orders) : null;
    const ph = o ? (Array.isArray(o.pharmacies) ? o.pharmacies[0] : o.pharmacies) : null;
    return { a, d, o, ph };
  });
  return (
    <div className="container-page max-w-3xl space-y-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Mes livraisons</h1>
        <form action={setCourierAvailability} className="flex items-center gap-2">
          <Badge className={courier!.is_available ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "bg-white"}>{courier!.is_available ? "Disponible" : "Indisponible"}</Badge>
          <input type="hidden" name="available" value={String(!courier!.is_available)} />
          <Button size="sm" variant="outline">{courier!.is_available ? "Me rendre indisponible" : "Me rendre disponible"}</Button>
        </form>
      </div>
      {!settings.delivery_enabled && <Alert tone="warning" title="Livraison désactivée sur la plateforme : aucune nouvelle affectation." />}
      {!rows.length ? <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">Aucune livraison affectée.</p> : (
        <ul className="space-y-2">{rows.map(({ a, d, o, ph }) => d && o && (
          <li key={a.id}><Link prefetch={false} href={`/livraison/${d.id}`} className="block rounded-xl border bg-white p-4 hover:border-primary">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{o.reference}{a.is_active ? "" : " (terminée)"}</p><OrderStatusBadge status={o.status as OrderStatus} /></div>
            <p className="text-sm">Collecte : {ph?.name} — {ph?.address}</p>
            <p className="text-sm">Remise : {d.dropoff_address}</p>
            <p className="text-xs text-muted-foreground">Affectée le {formatDateTime(a.assigned_at)}</p>
          </Link></li>))}</ul>
      )}
    </div>
  );
}
