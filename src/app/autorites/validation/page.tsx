import { BadgeCheck } from "lucide-react";
import { authorityContext } from "@/lib/authority-server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { validateData } from "@/app/actions/authorities";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Valider les données — SantéProxi Data", robots: { index: false } };
const VERDICT: Record<string, string> = { confirme: "Fiche exacte", a_corriger: "À corriger", ferme: "Structure fermée", inconnu: "Inconnue de nos registres" };

export default async function Validation() {
  const ctx = await authorityContext("/autorites/validation");
  if (!ctx.ok) return null;
  const { data: mine } = await ctx.supabase.from("data_validation_reports").select("id, public_code, verdict, comment, status, created_at").order("created_at", { ascending: false }).limit(50);
  return (
    <div className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-bold text-brand-deep"><BadgeCheck className="size-5 text-primary" aria-hidden /> Valider les données du référentiel</h2>
      <p className="text-sm text-muted-foreground">Chaque pharmacie, médecin, laboratoire et établissement porte un identifiant SantéProxi (SP-PH-…, SP-MD-…, SP-LB-…, SP-ET-…), affiché sur sa fiche. Confrontez-le à vos registres officiels et donnez votre avis : l&apos;équipe corrige la fiche et garde la trace de votre validation.</p>
      <section className="rounded-2xl border bg-white p-4 sm:p-5">
        <ActionForm action={validateData} className="grid gap-3 sm:grid-cols-2" labels={{ code: "Identifiant" }}>
          <Field label="Identifiant SantéProxi" htmlFor="cd" required><Input id="cd" name="code" required placeholder="SP-PH-000123" pattern="[Ss][Pp]-(PH|MD|LB|ET|ph|md|lb|et)-[0-9]{6}" /></Field>
          <Field label="Votre avis" htmlFor="vd" required><Select id="vd" name="verdict" defaultValue="confirme">{Object.entries(VERDICT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Précision (ce qui doit être corrigé, référence du registre…)" htmlFor="cm" className="sm:col-span-2"><Textarea id="cm" name="comment" rows={3} maxLength={1000} /></Field>
          <div className="sm:col-span-2"><SubmitButton>Envoyer</SubmitButton></div>
        </ActionForm>
      </section>
      <ul className="space-y-2">{(mine ?? []).map((r) => (
        <li key={r.id} className="rounded-xl border bg-white p-3 text-sm"><strong>{r.public_code}</strong> · {VERDICT[r.verdict]} · {formatDateTime(r.created_at)} · <em>{r.status === "traite" ? "traité" : "en attente"}</em>{r.comment ? <span className="block text-muted-foreground">{r.comment}</span> : null}</li>))}</ul>
    </div>
  );
}
