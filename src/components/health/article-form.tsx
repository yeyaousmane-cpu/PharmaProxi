import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { saveHealthArticle } from "@/app/actions/health";
import { HEALTH_AUDIENCE, HEALTH_KIND, HEALTH_RECO, HEALTH_SECTIONS, type HealthArticle, type HealthSource } from "@/lib/health/labels";
import { formatFaq, formatMyths, formatSources } from "@/lib/health/parse";

const SECTION_HINT: Record<string, string> = {
  definition: "Ce que c'est, en mots simples.",
  examens: "Examens ou dépistages éventuels. Ne présentez jamais un examen comme obligatoire pour tous sans source.",
  urgence: "Uniquement si pertinent. Apparaît dans un encadré rouge.",
  ou_au_mali: "Structures vérifiées seulement ; jamais de numéro ou de service inventé.",
};

/** Formulaire de rédaction (création et modification). Format texte simple, sans JSON. */
export function ArticleForm({ article, sources, categories, readOnly }: {
  article?: HealthArticle | null; sources?: HealthSource[]; categories: { slug: string; name: string; id: string }[]; readOnly?: boolean;
}) {
  const a = article;
  const cat = categories.find((c) => c.id === a?.category_id)?.slug ?? "mariage";
  return (
    <ActionForm action={saveHealthArticle} className="space-y-5" labels={{ title: "Titre", slug: "Identifiant", faq: "Questions fréquentes", myths: "Idées reçues", sources: "Sources" }}>
      {a && <input type="hidden" name="id" value={a.id} />}
      <fieldset disabled={readOnly} className="space-y-5 disabled:opacity-80">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Titre" htmlFor="hf-title" required><Input id="hf-title" name="title" defaultValue={a?.title} required maxLength={160} /></Field>
          <Field label="Identifiant d'adresse" htmlFor="hf-slug" hint="Laisser vide pour le générer depuis le titre. Minuscules, chiffres, tirets.">
            <Input id="hf-slug" name="slug" defaultValue={a?.slug} pattern="[a-z0-9\-]{3,90}" maxLength={90} />
          </Field>
          <Field label="Catégorie" htmlFor="hf-cat"><Select id="hf-cat" name="category_slug" defaultValue={cat}>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</Select></Field>
          <Field label="Type d'information" htmlFor="hf-kind"><Select id="hf-kind" name="kind" defaultValue={a?.kind ?? "fiche"}>{Object.entries(HEALTH_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Niveau de recommandation" htmlFor="hf-reco" hint="Pour les examens : à confirmer par le validateur selon les recommandations applicables au Mali.">
            <Select id="hf-reco" name="recommendation" defaultValue={a?.recommendation ?? ""}>
              <option value="">Sans objet</option>{Object.entries(HEALTH_RECO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </Field>
          <Field label="Mots-clés de recherche" htmlFor="hf-kw" hint="Synonymes et fautes courantes : palu, drepano, sida…"><Input id="hf-kw" name="keywords" defaultValue={a?.keywords ?? ""} maxLength={400} /></Field>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Pour qui</legend>
          <div className="flex flex-wrap gap-3">{Object.entries(HEALTH_AUDIENCE).map(([k, l]) => (
            <label key={k} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="audiences" value={k} defaultChecked={a?.audiences.includes(k)} className="size-4" /> {l}</label>
          ))}</div>
        </fieldset>
        <Field label="Résumé en langage simple" htmlFor="hf-sum" required hint="2 à 3 phrases compréhensibles sans vocabulaire médical (600 caractères max).">
          <Textarea id="hf-sum" name="summary" rows={3} defaultValue={a?.summary} maxLength={600} />
        </Field>
        <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
          <p className="text-sm font-semibold">Contenu (modèle standard) — laissez vide une rubrique sans objet</p>
          {HEALTH_SECTIONS.map(([k, label]) => (
            <Field key={k} label={label} htmlFor={`hf-${k}`} hint={SECTION_HINT[k]}>
              <Textarea id={`hf-${k}`} name={`body_${k}`} rows={k === "definition" || k === "importance" ? 4 : 3} defaultValue={a?.body?.[k] ?? ""} maxLength={6000} />
            </Field>
          ))}
        </div>
        <Field label="Idées reçues" htmlFor="hf-myths" hint="Un bloc par idée, séparés par une ligne vide : « Idée : … » puis « Vérité : … ».">
          <Textarea id="hf-myths" name="myths" rows={5} defaultValue={a ? formatMyths(a.myths) : ""} />
        </Field>
        <Field label="Questions fréquentes" htmlFor="hf-faq" hint="Un bloc par question, séparés par une ligne vide : « Q : … » puis « R : … ».">
          <Textarea id="hf-faq" name="faq" rows={6} defaultValue={a ? formatFaq(a.faq) : ""} />
        </Field>
        <Field label="Sources médicales" htmlFor="hf-src" required hint="Une par ligne : Titre | Organisme | Lien | Date de publication (si connue) | Date de consultation AAAA-MM-JJ. N'inventez jamais une source.">
          <Textarea id="hf-src" name="sources" rows={5} defaultValue={sources ? formatSources(sources) : ""} className="font-mono text-xs" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Examens liés (codes)" htmlFor="hf-ex" hint="Ex. electrophorese_hb, groupe_sanguin — affiche « Où faire l'examen ».">
            <Input id="hf-ex" name="exam_codes" defaultValue={a?.exam_codes.join(", ")} />
          </Field>
          <Field label="Spécialités liées (codes)" htmlFor="hf-sp" hint="Ex. hematologie, gynecologie — affiche « Quel professionnel consulter ».">
            <Input id="hf-sp" name="specialty_codes" defaultValue={a?.specialty_codes.join(", ")} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_featured" defaultChecked={a?.is_featured} className="size-4" /> Afficher dans « Informations essentielles »</label>
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton pendingText="Enregistrement…">{a ? "Enregistrer" : "Créer le brouillon"}</SubmitButton>
            {a?.status === "published" && <span className="text-xs text-amber-800">Attention : modifier une fiche publiée la retire du public jusqu&apos;à sa nouvelle validation.</span>}
          </div>
        )}
      </fieldset>
    </ActionForm>
  );
}
