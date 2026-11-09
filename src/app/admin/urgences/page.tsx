import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select } from "@/components/ui/input";
import { saveEmergencyContact, deleteEmergencyContact } from "@/app/actions/v024";
import { displayNumber } from "@/components/emergency/emergency-numbers";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Numéros d'urgence — administration" };
export const dynamic = "force-dynamic";

type Row = { id: string; country: string; region: string | null; name: string; mission: string | null; phone: string; phone_alt: string | null;
  tier: string; icon: string; status: string; source_url: string | null; source_note: string | null; verified_at: string | null; active: boolean; sort: number };

const STATUS: Record<string, [string, string]> = {
  a_verifier: ["À vérifier", "bg-amber-100 text-amber-900"], verifie: ["Vérifié", "bg-emerald-100 text-emerald-900"], a_actualiser: ["À actualiser", "bg-red-100 text-red-900"],
};
const ICONS = [["sante", "Santé"], ["protection_civile", "Protection civile / pompiers"], ["police", "Police"], ["gendarmerie", "Gendarmerie"], ["crise", "Gestion des crises"], ["garde", "Garde nationale"], ["ambulance", "Ambulance"], ["autre", "Autre"]];

function ContactFields({ c }: { c?: Row }) {
  const k = c?.id ?? "new";
  return (
    <>
      {c && <input type="hidden" name="id" value={c.id} />}
      <Field label="Nom du service" htmlFor={`nm-${k}`} required><Input id={`nm-${k}`} name="name" maxLength={120} required defaultValue={c?.name} /></Field>
      <Field label="Numéro" htmlFor={`ph-${k}`} required><Input id={`ph-${k}`} name="phone" maxLength={20} required inputMode="tel" defaultValue={c?.phone} /></Field>
      <Field label="Second numéro (facultatif)" htmlFor={`pa-${k}`}><Input id={`pa-${k}`} name="phone_alt" maxLength={20} inputMode="tel" defaultValue={c?.phone_alt ?? ""} /></Field>
      <Field label="Mission du service" htmlFor={`mi-${k}`}><Input id={`mi-${k}`} name="mission" maxLength={300} defaultValue={c?.mission ?? ""} /></Field>
      <Field label="Pays (code ISO)" htmlFor={`co-${k}`}><Input id={`co-${k}`} name="country" maxLength={2} defaultValue={c?.country ?? "ML"} /></Field>
      <Field label="Région (vide = tout le pays)" htmlFor={`re-${k}`}><Input id={`re-${k}`} name="region" maxLength={80} defaultValue={c?.region ?? ""} /></Field>
      <Field label="Rang" htmlFor={`ti-${k}`}><Select id={`ti-${k}`} name="tier" defaultValue={c?.tier ?? "principal"}><option value="principal">Numéro principal</option><option value="complementaire">Autre contact utile</option></Select></Field>
      <Field label="Icône" htmlFor={`ic-${k}`}><Select id={`ic-${k}`} name="icon" defaultValue={c?.icon ?? "autre"}>{ICONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
      <Field label="Statut" htmlFor={`st-${k}`}><Select id={`st-${k}`} name="status" defaultValue={c?.status ?? "a_verifier"}><option value="a_verifier">À vérifier</option><option value="verifie">Vérifié</option><option value="a_actualiser">À actualiser</option></Select></Field>
      <Field label="Date de vérification" htmlFor={`vd-${k}`}><Input id={`vd-${k}`} name="verified_at" type="date" defaultValue={c?.verified_at ?? ""} /></Field>
      <Field label="Source officielle (lien https)" htmlFor={`su-${k}`}><Input id={`su-${k}`} name="source_url" maxLength={300} defaultValue={c?.source_url ?? ""} placeholder="https://…" /></Field>
      <Field label="Note de vérification" htmlFor={`sn-${k}`}><Input id={`sn-${k}`} name="source_note" maxLength={200} defaultValue={c?.source_note ?? ""} placeholder="ex. appel de test le 9 nov. 2026" /></Field>
      <Field label="Ordre d'affichage" htmlFor={`so-${k}`}><Input id={`so-${k}`} name="sort" type="number" min={0} max={9999} defaultValue={c?.sort ?? 100} /></Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="active" defaultChecked={c ? c.active : true} className="size-4" /> Affiché sur la page SOS</label>
    </>
  );
}

export default async function AdminEmergency() {
  const supabase = await createClient();
  const { data } = await supabase.from("emergency_contacts").select("*").order("country").order("tier", { ascending: false }).order("sort");
  const rows = (data as Row[] | null) ?? [];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">SOS Santé : numéros d&apos;urgence</h1>
      <p className="text-sm text-muted-foreground">Ces numéros s&apos;affichent sur la page SOS Santé avec un bouton d&apos;appel direct. Ne passez un numéro en « Vérifié » qu&apos;après confirmation auprès de l&apos;autorité concernée (site officiel ou appel de test), avec la source. N&apos;ajoutez pas les anciens numéros 15, 17 et 18 sans confirmation officielle.</p>
      <section className="rounded-2xl border bg-white p-4">
        <h2 className="mb-3 font-bold">Ajouter un numéro</h2>
        <ActionForm action={saveEmergencyContact} className="grid gap-3 sm:grid-cols-2" resetOnSuccess>
          <ContactFields />
          <div className="sm:col-span-2"><SubmitButton>Ajouter</SubmitButton></div>
        </ActionForm>
      </section>
      <ul className="space-y-2">{rows.map((c) => {
        const [label, tone] = STATUS[c.status] ?? STATUS.a_verifier;
        return (
          <li key={c.id} className="rounded-2xl border bg-white">
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-3 text-sm">
                <strong className="text-base">{displayNumber(c.phone)}{c.phone_alt ? ` / ${displayNumber(c.phone_alt)}` : ""}</strong>
                <span>{c.name}</span><span className="text-muted-foreground">· {c.country}{c.region ? ` · ${c.region}` : ""} · {c.tier === "principal" ? "principal" : "autre contact"}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>
                {c.verified_at && <span className="text-xs text-muted-foreground">vérifié le {formatDate(c.verified_at)}</span>}
                {!c.active && <em className="text-xs text-muted-foreground">(masqué)</em>}
              </summary>
              <div className="border-t p-3">
                <ActionForm action={saveEmergencyContact} className="grid gap-3 sm:grid-cols-2"><ContactFields c={c} /><div className="sm:col-span-2"><SubmitButton size="sm">Enregistrer</SubmitButton></div></ActionForm>
                <ActionForm action={deleteEmergencyContact} className="mt-2"><input type="hidden" name="id" value={c.id} /><SubmitButton size="sm" variant="outline" confirm={`Supprimer définitivement ${c.name} (${displayNumber(c.phone)}) ?`}>Supprimer</SubmitButton></ActionForm>
              </div>
            </details>
          </li>);
      })}
        {rows.length === 0 && <li className="rounded-2xl border bg-white p-3 text-sm text-muted-foreground">Aucun numéro enregistré.</li>}</ul>
    </div>
  );
}
