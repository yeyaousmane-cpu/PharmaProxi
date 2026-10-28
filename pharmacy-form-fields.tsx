import { Field, Input } from "@/components/ui/input";
import { LocationPicker } from "@/components/location-picker";
import type { GeoData } from "@/lib/geo";
import { DAYS, DAY_LABELS } from "@/lib/validation";
import { formatPhone } from "@/lib/format";

type Values = Partial<{
  name: string; address: string; region_id: string; circle_id: string | null; commune_id: string | null; locality_id: string | null;
  phone: string; whatsapp: string | null; email: string | null; latitude: number | null; longitude: number | null;
  offers_pickup: boolean; offers_delivery: boolean; opening_hours: Record<string, [string, string][]>;
  pharmacist_in_charge: string; legal_name: string | null; license_number: string | null; order_registration: string | null;
  tax_id: string | null; rccm: string | null; manager_phone: string | null;
}>;

export const PHARMACY_LABELS: Record<string, string> = {
  name: "Nom", address: "Adresse", region_id: "Région", phone: "Téléphone", whatsapp: "WhatsApp", email: "E-mail",
  latitude: "Coordonnées", pharmacist_in_charge: "Pharmacien responsable", manager_phone: "Téléphone du responsable",
};

/** Champs partagés entre l'inscription et la modification d'une pharmacie. */
export function PharmacyFormFields({ geo, v = {} }: { geo: GeoData; v?: Values }) {
  return (
    <div className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="text-base font-bold">Pharmacie</legend>
        <Field label="Nom commercial" htmlFor="name" required><Input id="name" name="name" required maxLength={120} defaultValue={v.name} /></Field>
        <Field label="Adresse" htmlFor="address" required hint="Rue, porte, repère"><Input id="address" name="address" required maxLength={300} defaultValue={v.address} /></Field>
        <LocationPicker geo={geo} requiredRegion showCircle names={{ region: "region_id", circle: "circle_id", commune: "commune_id", locality: "locality_id" }}
          defaults={{ region: v.region_id, circle: v.circle_id ?? undefined, commune: v.commune_id ?? undefined, locality: v.locality_id ?? undefined }} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Latitude" htmlFor="latitude" hint="Facultatif. Ex. 12.6392"><Input id="latitude" name="latitude" inputMode="decimal" defaultValue={v.latitude ?? ""} /></Field>
          <Field label="Longitude" htmlFor="longitude" hint="Ex. -8.0029"><Input id="longitude" name="longitude" inputMode="decimal" defaultValue={v.longitude ?? ""} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Téléphone professionnel" htmlFor="phone" required><Input id="phone" name="phone" type="tel" required defaultValue={formatPhone(v.phone)} /></Field>
          <Field label="WhatsApp" htmlFor="whatsapp"><Input id="whatsapp" name="whatsapp" type="tel" defaultValue={formatPhone(v.whatsapp)} /></Field>
          <Field label="E-mail" htmlFor="email"><Input id="email" name="email" type="email" defaultValue={v.email ?? ""} /></Field>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="offers_pickup" defaultChecked={v.offers_pickup ?? true} className="size-4" /> Retrait en pharmacie</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="offers_delivery" defaultChecked={v.offers_delivery ?? false} className="size-4" /> Livraison (si activée par la plateforme)</label>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-base font-bold">Horaires d&apos;ouverture</legend>
        <p className="mb-2 text-xs text-muted-foreground">Laissez vide un jour de fermeture. Heure du Mali. Les horaires seront vérifiés par l&apos;équipe.</p>
        <div className="grid gap-2">
          {DAYS.map((d) => {
            const slot = v.opening_hours?.[d]?.[0];
            return (
              <div key={d} className="grid grid-cols-[90px_1fr_1fr] items-center gap-2 text-sm">
                <span className="font-medium">{DAY_LABELS[d]}</span>
                <Input aria-label={`Ouverture ${DAY_LABELS[d]}`} name={`open_${d}`} type="time" defaultValue={slot?.[0]} className="h-9" />
                <Input aria-label={`Fermeture ${DAY_LABELS[d]}`} name={`close_${d}`} type="time" defaultValue={slot?.[1] === "24:00" ? "23:59" : slot?.[1]} className="h-9" />
              </div>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-base font-bold">Responsable et informations réglementaires</legend>
        <p className="text-xs text-muted-foreground">Ces informations ne sont visibles que par votre équipe et l&apos;administration de PharmaProxi.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Pharmacien responsable" htmlFor="pharmacist_in_charge" required><Input id="pharmacist_in_charge" name="pharmacist_in_charge" required defaultValue={v.pharmacist_in_charge} /></Field>
          <Field label="Téléphone du responsable" htmlFor="manager_phone"><Input id="manager_phone" name="manager_phone" type="tel" defaultValue={formatPhone(v.manager_phone)} /></Field>
          <Field label="Raison sociale" htmlFor="legal_name"><Input id="legal_name" name="legal_name" defaultValue={v.legal_name ?? ""} /></Field>
          <Field label="N° d'autorisation d'ouverture" htmlFor="license_number"><Input id="license_number" name="license_number" defaultValue={v.license_number ?? ""} /></Field>
          <Field label="N° d'inscription à l'Ordre" htmlFor="order_registration"><Input id="order_registration" name="order_registration" defaultValue={v.order_registration ?? ""} /></Field>
          <Field label="NIF" htmlFor="tax_id"><Input id="tax_id" name="tax_id" defaultValue={v.tax_id ?? ""} /></Field>
          <Field label="RCCM" htmlFor="rccm"><Input id="rccm" name="rccm" defaultValue={v.rccm ?? ""} /></Field>
        </div>
      </fieldset>
    </div>
  );
}
