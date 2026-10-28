import { Field, Input } from "@/components/ui/input";
import { LocationPicker } from "@/components/location-picker";
import type { GeoData } from "@/lib/geo";
import { formatPhone } from "@/lib/format";

type Values = Partial<{
  id: string; name: string; region_id: string; commune_id: string | null; locality_id: string | null; area_label: string | null;
  address: string | null; phone: string | null; latitude: number | null; longitude: number | null; source: string;
}>;

/** Champs d'une fiche « pharmacie non encore inscrite » (ajout et modification). */
export function ListingFormFields({ geo, v = {} }: { geo: GeoData; v?: Values }) {
  return (
    <div className="space-y-3">
      {v.id ? <input type="hidden" name="id" value={v.id} /> : null}
      <Field label="Nom de la pharmacie" htmlFor="l-name" required><Input id="l-name" name="name" required minLength={2} maxLength={160} defaultValue={v.name} /></Field>
      <LocationPicker geo={geo} requiredRegion names={{ region: "region_id", commune: "commune_id", locality: "locality_id" }}
        defaults={{ region: v.region_id, commune: v.commune_id ?? undefined, locality: v.locality_id ?? undefined }} />
      <Field label="Commune / quartier en texte libre" htmlFor="l-area" hint="Si la commune ou le quartier n'existe pas encore dans le référentiel géographique">
        <Input id="l-area" name="area_label" maxLength={200} defaultValue={v.area_label ?? ""} />
      </Field>
      <Field label="Adresse ou repère" htmlFor="l-address"><Input id="l-address" name="address" maxLength={300} defaultValue={v.address ?? ""} /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Téléphone" htmlFor="l-phone" hint="Ex. 76 32 23 41"><Input id="l-phone" name="phone" type="tel" defaultValue={formatPhone(v.phone)} /></Field>
        <Field label="Latitude" htmlFor="l-lat" hint="Ex. 12.6392"><Input id="l-lat" name="latitude" inputMode="decimal" defaultValue={v.latitude ?? ""} /></Field>
        <Field label="Longitude" htmlFor="l-lng" hint="Ex. -8.0029"><Input id="l-lng" name="longitude" inputMode="decimal" defaultValue={v.longitude ?? ""} /></Field>
      </div>
      <Field label="Source de l'information" htmlFor="l-source" hint="Ex. relevé terrain, liste de l'Ordre, partenaire autorisé">
        <Input id="l-source" name="source" maxLength={200} defaultValue={v.source ?? ""} />
      </Field>
    </div>
  );
}
