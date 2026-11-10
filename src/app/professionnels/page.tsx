import Link from "next/link";
import { Building2, FlaskConical, ShieldCheck, Stethoscope, Store } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getGeo } from "@/lib/geo";
import { createClient } from "@/lib/supabase/server";
import { submitProContact } from "@/app/actions/pro";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select, Textarea } from "@/components/ui/input";

export const metadata = { title: "Professionnels de santé", description: "Pharmacies, médecins, cliniques et laboratoires : rejoignez SantéProxi après vérification de votre autorisation d'exercer." };
export const dynamic = "force-dynamic";

const TYPES = [["pharmacie", "Pharmacien(ne)"], ["medecin", "Médecin"], ["clinique", "Clinique ou centre de santé"], ["laboratoire", "Laboratoire"], ["autre", "Autre professionnel de santé"]] as const;
const NEXT: Record<string, [string, string]> = { pharmacie: ["/pharmacien/inscription", "Inscrire ma pharmacie"], medecin: ["/medecin/inscription", "Créer ma fiche de médecin"], clinique: ["/clinique/inscription", "Inscrire mon établissement"] };

export default async function Professionals({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const sp = await searchParams;
  const [s, geo] = await Promise.all([getSession(), getGeo()]);
  let allowed: string[] = [];
  if (s) {
    const supabase = await createClient();
    allowed = ((await supabase.from("pro_authorizations").select("kind").eq("user_id", s.userId)).data ?? []).map((a) => a.kind as string);
  }
  const def = TYPES.some(([k]) => k === sp.type) ? sp.type! : "pharmacie";
  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <header className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-blue"><ShieldCheck className="size-4" aria-hidden /> Professionnels de santé</p>
        <h1 className="text-2xl font-bold text-brand-deep">Rejoindre SantéProxi</h1>
        <p className="text-muted-foreground">Pharmacies, médecins, cliniques et laboratoires : votre présence sur SantéProxi est gratuite. Pour protéger les patients, chaque professionnel est vérifié par l&apos;équipe avant d&apos;avoir accès à son espace. Personne ne peut s&apos;inscrire seul comme professionnel.</p>
      </header>

      {allowed.length > 0 && (
        <section className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="font-semibold text-emerald-900">Votre compte est autorisé. Vous pouvez compléter votre inscription :</p>
          <div className="flex flex-wrap gap-2">{allowed.filter((k) => NEXT[k]).map((k) => <Link key={k} prefetch={false} href={NEXT[k][0]} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">{NEXT[k][1]}</Link>)}</div>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        {[[Store, "Pharmacies", "Stocks, gardes, réservations et questions des patients."], [Stethoscope, "Médecins", "Fiche publique, lieux de consultation, rendez-vous."], [Building2, "Cliniques et centres", "Services, horaires, médecins, rendez-vous."], [FlaskConical, "Laboratoires", "Toutes vos analyses et vos prix, prise de sang à domicile."]].map(([Icon, t, d]) => {
          const I = Icon as typeof Store;
          return <div key={t as string} className="flex gap-3 rounded-2xl border bg-white p-4"><I className="mt-0.5 size-6 shrink-0 text-brand-blue" aria-hidden /><div><p className="font-semibold text-brand-deep">{t as string}</p><p className="text-sm text-muted-foreground">{d as string}</p></div></div>;
        })}
      </section>

      <section className="space-y-2 rounded-2xl bg-muted/50 p-4 text-sm">
        <p className="font-semibold">Comment ça se passe ?</p>
        <ol className="list-decimal space-y-1 ps-5">
          <li>Vous envoyez ce formulaire avec la référence de votre autorisation (inscription à l&apos;Ordre, arrêté ou agrément d&apos;ouverture).</li>
          <li>L&apos;équipe vérifie auprès des registres officiels et vous recontacte.</li>
          <li>Vous créez un compte SantéProxi normal ; l&apos;équipe l&apos;autorise et vous recevez une notification pour compléter votre fiche.</li>
          <li>Votre fiche est publiée après le dépôt et la vérification de vos justificatifs.</li>
        </ol>
      </section>

      <section className="rounded-2xl border bg-white p-4 sm:p-5">
        <h2 className="mb-3 text-lg font-bold text-brand-deep">Envoyer une demande</h2>
        <ActionForm action={submitProContact} className="grid gap-3 sm:grid-cols-2" labels={{ kind: "Profession", full_name: "Nom", structure: "Structure", phone: "Téléphone", email: "E-mail" }}>
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
          <Field label="Vous êtes" htmlFor="kd" required><Select id="kd" name="kind" defaultValue={def}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Votre nom" htmlFor="fn" required><Input id="fn" name="full_name" maxLength={120} required /></Field>
          <Field label="Nom de la pharmacie, du cabinet ou de l'établissement" htmlFor="st" required className="sm:col-span-2"><Input id="st" name="structure" maxLength={160} required /></Field>
          <Field label="Région" htmlFor="rg"><Select id="rg" name="region_id" defaultValue=""><option value="">—</option>{geo.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
          <Field label="Téléphone" htmlFor="ph" required><Input id="ph" name="phone" type="tel" inputMode="tel" required placeholder="+223 70 00 00 00" /></Field>
          <Field label="E-mail (celui de votre compte SantéProxi si vous en avez un)" htmlFor="em" className="sm:col-span-2"><Input id="em" name="email" type="email" defaultValue={s?.email ?? ""} /></Field>
          <Field label="Référence de votre autorisation" htmlFor="au" className="sm:col-span-2" hint="N° d'inscription à l'Ordre, arrêté ou agrément d'ouverture"><Input id="au" name="authorization_ref" maxLength={160} /></Field>
          <Field label="Message (facultatif)" htmlFor="ms" className="sm:col-span-2"><Textarea id="ms" name="message" rows={3} maxLength={1000} /></Field>
          <p className="text-xs text-muted-foreground sm:col-span-2">Ces informations servent uniquement à vérifier votre demande. Elles ne sont pas publiées.</p>
          <div className="sm:col-span-2"><SubmitButton pendingText="Envoi…">Envoyer la demande</SubmitButton></div>
        </ActionForm>
      </section>
      <p className="text-sm text-muted-foreground">Partenaires techniques : <Link prefetch={false} href="/partenaires/api" className="text-primary underline">API publique</Link>.</p>
    </div>
  );
}
