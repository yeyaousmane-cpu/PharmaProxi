import { Field, Input, Select } from "@/components/ui/input";
import { LANGUAGES } from "@/lib/directory";
import { formatPhone } from "@/lib/format";
import type { Specialty } from "@/lib/directory-server";

type Values = Partial<{
  title: string; display_name: string; gender: string | null; languages: string[]; order_number: string; personal_phone: string | null; specialties: string[];
}>;

export const DOCTOR_LABELS: Record<string, string> = {
  display_name: "Nom affiché", order_number: "N° d'inscription à l'Ordre", personal_phone: "Téléphone personnel",
  languages: "Langues", specialties: "Spécialités", consent: "Consentement",
};

/** Champs de la fiche médecin (référencement et modification). */
export function DoctorFormFields({ specialties, v = {} }: { specialties: [string, Specialty[]][]; v?: Values }) {
  const langs = v.languages ?? ["fr"];
  const specs = v.specialties ?? [];
  return (
    <div className="space-y-6">
      <fieldset className="min-w-0 space-y-3">
        <legend className="text-base font-bold">Identité professionnelle (publique)</legend>
        <div className="grid gap-3 sm:grid-cols-[120px_1fr_180px]">
          <Field label="Titre" htmlFor="title"><Select id="title" name="title" defaultValue={v.title ?? "Dr"}><option value="Dr">Dr</option><option value="Pr">Pr</option></Select></Field>
          <Field label="Nom affiché" htmlFor="display_name" required hint="Prénom et nom, tels que les patients vous connaissent">
            <Input id="display_name" name="display_name" required minLength={2} maxLength={120} defaultValue={v.display_name} />
          </Field>
          <Field label="Genre (facultatif)" htmlFor="gender" hint="Utile aux patients qui ont une préférence">
            <Select id="gender" name="gender" defaultValue={v.gender ?? ""}><option value="">Ne pas indiquer</option><option value="F">Femme</option><option value="M">Homme</option></Select>
          </Field>
        </div>
        <fieldset className="min-w-0">
          <legend className="text-sm font-medium">Langues de consultation <span className="text-destructive" aria-hidden>*</span></legend>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {Object.entries(LANGUAGES).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2"><input type="checkbox" name="languages" value={k} defaultChecked={langs.includes(k)} className="size-4" /> {label}</label>
            ))}
          </div>
        </fieldset>
      </fieldset>

      <fieldset className="min-w-0">
        <legend className="text-base font-bold">Spécialités <span className="text-destructive" aria-hidden>*</span></legend>
        <p className="mb-2 text-xs text-muted-foreground">1 à 4 spécialités. Chacune doit être justifiée par un diplôme ou un titre déposé ci-après.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {specialties.map(([family, list]) => (
            <div key={family} className="rounded-lg border p-3">
              <p className="mb-1 text-xs font-semibold text-muted-foreground">{family}</p>
              {list.map((s) => (
                <label key={s.id} className="flex items-center gap-2 py-0.5 text-sm">
                  <input type="checkbox" name="specialties" value={s.id} defaultChecked={specs.includes(s.id)} className="size-4" /> {s.name}
                </label>
              ))}
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="min-w-0 space-y-3">
        <legend className="text-base font-bold">Informations de vérification (privées)</legend>
        <p className="text-xs text-muted-foreground">Visibles uniquement par vous et l&apos;équipe de vérification de PharmaProxi. Jamais publiées.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="N° d'inscription à l'Ordre des médecins" htmlFor="order_number" required>
            <Input id="order_number" name="order_number" required maxLength={60} defaultValue={v.order_number} />
          </Field>
          <Field label="Téléphone personnel (pour la vérification)" htmlFor="personal_phone" hint="Jamais affiché aux patients">
            <Input id="personal_phone" name="personal_phone" type="tel" defaultValue={formatPhone(v.personal_phone)} />
          </Field>
        </div>
      </fieldset>
    </div>
  );
}
