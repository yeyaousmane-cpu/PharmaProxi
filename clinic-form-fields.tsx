import { Field, Input, Select } from "@/components/ui/input";
import { LocationPicker } from "@/components/location-picker";
import { ScheduleFields } from "@/components/directory/schedule-fields";
import type { GeoData } from "@/lib/geo";
import { CLINIC_KINDS, CLINIC_SERVICES, type Schedule } from "@/lib/directory";
import { formatPhone } from "@/lib/format";

type Values = Partial<{
  name: string; kind: string; address: string; region_id: string; commune_id: string | null; locality_id: string | null;
  phone: string; whatsapp: string | null; email: string | null; latitude: number | null; longitude: number | null;
  opening_hours: Schedule; emergency_24h: boolean; services: string[];
  manager_name: string; manager_phone: string | null; legal_name: string | null; license_number: string | null; rccm: string | null; tax_id: string | null;
}>;

export const CLINIC_LABELS: Record<string, string> = {
  name: "Nom", kind: "Type", address: "Adresse", region_id: "Région", phone: "Téléphone", whatsapp: "WhatsApp", email: "E-mail",
  latitude: "Coordonnées", manager_name: "Responsable", manager_phone: "Téléphone du responsable",
};

/** Champs partagés entre l'inscription et la modification d'un établissement. */
export function ClinicFormFields({ geo, v = {} }: { geo: GeoData; v?: Values }) {
  const services = v.services ?? [];
  return (
    <div className="space-y-6">
      <fieldset className="min-w-0 space-y-3">
        <legend className="text-base font-bold">Établissement (public)</legend>
        <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
          <Field label="Nom" htmlFor="name" required><Input id="name" name="name" required maxLength={120} defaultValue={v.name} /></Field>
          <Field label="Type" htmlFor="kind" required>
            <Select id="kind" name="kind" defaultValue={v.kind ?? "clinique"}>{Object.entries(CLINIC_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          </Field>
        </div>
        <Field label="Adresse" htmlFor="address" required hint="Rue, porte, repère"><Input id="address" name="address" required maxLength={300} defaultValue={v.address} /></Field>
        <LocationPicker geo={geo} requiredRegion names={{ region: "region_id", commune: "commune_id", locality: "locality_id" }}
          defaults={{ region: v.region_id, commune: v.commune_id ?? undefined, locality: v.locality_id ?? undefined }} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Latitude" htmlFor="latitude" hint="Facultatif mais recommandé (carte, distance). Ex. 12.6392"><Input id="latitude" name="latitude" inputMode="decimal" defaultValue={v.latitude ?? ""} /></Field>
          <Field label="Longitude" htmlFor="longitude" hint="Ex. -8.0029"><Input id="longitude" name="longitude" inputMode="decimal" defaultValue={v.longitude ?? ""} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Téléphone de l'accueil" htmlFor="phone" required><Input id="phone" name="phone" type="tel" required defaultValue={formatPhone(v.phone)} /></Field>
          <Field label="WhatsApp" htmlFor="whatsapp"><Input id="whatsapp" name="whatsapp" type="tel" defaultValue={formatPhone(v.whatsapp)} /></Field>
          <Field label="E-mail" htmlFor="email"><Input id="email" name="email" type="email" defaultValue={v.email ?? ""} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="emergency_24h" defaultChecked={v.emergency_24h ?? false} className="size-4" /> Service d&apos;urgence ouvert 24 h/24</label>
        <fieldset className="min-w-0">
          <legend className="text-sm font-medium">Services disponibles</legend>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {Object.entries(CLINIC_SERVICES).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2"><input type="checkbox" name="services" value={k} defaultChecked={services.includes(k)} className="size-4" /> {l}</label>
            ))}
          </div>
        </fieldset>
      </fieldset>

      <ScheduleFields value={v.opening_hours} idPrefix="hours" legend="Horaires d'accueil" hint="Laissez vide un jour de fermeture. Deuxième plage facultative. Heure du Mali." />

      <fieldset className="min-w-0 space-y-3">
        <legend className="text-base font-bold">Responsable et informations réglementaires (privées)</legend>
        <p className="text-xs text-muted-foreground">Visibles uniquement par votre équipe et l&apos;équipe de vérification de PharmaProxi.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom du responsable" htmlFor="manager_name" required><Input id="manager_name" name="manager_name" required maxLength={120} defaultValue={v.manager_name} /></Field>
          <Field label="Téléphone du responsable" htmlFor="manager_phone"><Input id="manager_phone" name="manager_phone" type="tel" defaultValue={formatPhone(v.manager_phone)} /></Field>
          <Field label="Raison sociale" htmlFor="legal_name"><Input id="legal_name" name="legal_name" maxLength={200} defaultValue={v.legal_name ?? ""} /></Field>
          <Field label="N° d'autorisation d'ouverture" htmlFor="license_number"><Input id="license_number" name="license_number" maxLength={100} defaultValue={v.license_number ?? ""} /></Field>
          <Field label="RCCM" htmlFor="rccm"><Input id="rccm" name="rccm" maxLength={80} defaultValue={v.rccm ?? ""} /></Field>
          <Field label="NIF" htmlFor="tax_id"><Input id="tax_id" name="tax_id" maxLength={50} defaultValue={v.tax_id ?? ""} /></Field>
        </div>
      </fieldset>
    </div>
  );
}
