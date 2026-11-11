import Link from "next/link";
import { ExternalLink, HeartHandshake, Siren } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { BloodNav } from "@/components/blood/blood-nav";
import { reportDonationEvent } from "@/app/actions/donor";
import { AFTER_TIPS, EVENT_KINDS } from "@/lib/eligibility";

export const metadata = { title: "Mon suivi après le don", description: "Conseils après un don de sang et déclaration privée d'un malaise ou d'une gêne." };
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { nouveau: "Transmise", pris_en_compte: "Prise en compte par le CNTS", clos: "Close" };

export default async function AfterDonation() {
  const session = await getSession();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [validator, donor, donations, events] = session ? await Promise.all([
    supabase.rpc("is_blood_validator").then((r) => !!r.data),
    supabase.from("blood_donor_profiles").select("user_id").eq("user_id", session.userId).maybeSingle().then((r) => !!r.data),
    supabase.from("blood_donations").select("id, donated_on, center").eq("donor_id", session.userId).neq("status", "refuse").order("donated_on", { ascending: false }).limit(10).then((r) => r.data ?? []),
    supabase.from("blood_donation_events").select("id, reference, kind, occurred_on, status, handler_note, created_at").eq("donor_id", session.userId).order("created_at", { ascending: false }).limit(20).then((r) => r.data ?? []),
  ]) : [false, false, [], []];
  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <BloodNav current="/don-de-sang/apres-le-don" validator={validator} />
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><HeartHandshake className="size-7 text-red-600" aria-hidden /> Mon suivi après le don</h1>
        <p className="text-muted-foreground">Merci pour votre don. Voici comment bien récupérer, et que faire si quelque chose ne va pas.</p>
      </header>
      <section className="flex items-start gap-3 rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-sm text-red-950">
        <Siren className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div><p className="font-bold">Perte de connaissance, douleur dans la poitrine, gêne pour respirer, saignement qui ne s&apos;arrête pas ?</p>
          <p>N&apos;attendez pas : appelez les <Link prefetch={false} href="/urgences" className="font-semibold underline">numéros d&apos;urgence</Link> ou rendez-vous au service d&apos;urgences le plus proche. Pour toute autre gêne, contactez le centre où vous avez donné ou votre médecin.</p></div>
      </section>
      <section className="space-y-2" aria-labelledby="conseils">
        <h2 id="conseils" className="text-lg font-bold text-brand-deep">Conseils après le don</h2>
        <ul className="grid gap-3 sm:grid-cols-2">{AFTER_TIPS.map((t) => (
          <li key={t.title} className="rounded-2xl border bg-white p-4 text-sm"><p className="font-semibold">{t.title}</p><p>{t.text}</p>
            <a href={t.src.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-muted-foreground underline">{t.src.label}<ExternalLink className="ms-0.5 inline size-3" aria-hidden /></a></li>))}</ul>
        <p className="text-xs text-muted-foreground">Conseils généraux issus de sources publiées ; les consignes données par le centre de collecte priment.</p>
      </section>
      <section className="space-y-3 rounded-2xl border bg-white p-4" aria-labelledby="declarer">
        <h2 id="declarer" className="text-lg font-bold text-brand-deep">Signaler un événement après mon don</h2>
        <p className="text-sm text-muted-foreground">Votre déclaration est privée : seuls vous et les membres habilités du CNTS peuvent la lire. Elle aide à améliorer la sécurité des donneurs. Elle ne remplace pas une consultation.</p>
        {!session ? <p className="text-sm"><Link prefetch={false} href="/connexion?suite=%2Fdon-de-sang%2Fapres-le-don" className="font-semibold text-primary underline">Connectez-vous</Link> pour faire une déclaration.</p>
          : !donor ? <p className="text-sm">Créez d&apos;abord votre <Link prefetch={false} href="/don-de-sang/mon-espace" className="font-semibold text-primary underline">espace donneur</Link>.</p> : (
          <ActionForm action={reportDonationEvent} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
            <Field label="Ce qui s'est passé" htmlFor="ek" required><Select id="ek" name="kind" required defaultValue=""><option value="" disabled>Choisir…</option>{Object.entries(EVENT_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="Date" htmlFor="eo" required><Input id="eo" type="date" name="occurred_on" max={today} required defaultValue={today} /></Field>
            <Field label="Don concerné (facultatif)" htmlFor="ed" className="sm:col-span-2"><Select id="ed" name="donation_id" defaultValue=""><option value="">—</option>{(donations as { id: string; donated_on: string; center: string }[]).map((d) => <option key={d.id} value={d.id}>{formatDate(d.donated_on)} — {d.center}</option>)}</Select></Field>
            <Field label="Description (facultatif)" htmlFor="es" className="sm:col-span-2"><Textarea id="es" name="description" maxLength={1000} rows={3} placeholder="ex. vertiges le soir du don, bleu au bras" /></Field>
            <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="contact_ok" className="mt-1 size-4" /> J&apos;accepte que le CNTS me recontacte au numéro de mon compte</label>
            <div className="sm:col-span-2"><SubmitButton>Envoyer la déclaration</SubmitButton></div>
          </ActionForm>
        )}
        {(events as { id: string; reference: string; kind: string; occurred_on: string; status: string; handler_note: string | null }[]).length > 0 && (
          <ul className="divide-y rounded-xl border text-sm">{(events as { id: string; reference: string; kind: string; occurred_on: string; status: string; handler_note: string | null }[]).map((e) => (
            <li key={e.id} className="p-3"><p className="font-semibold">{EVENT_KINDS[e.kind]} · {formatDate(e.occurred_on)}</p><p className="text-xs text-muted-foreground">{e.reference} · {STATUS[e.status]}</p>{e.handler_note && <p className="text-xs">Réponse : {e.handler_note}</p>}</li>))}</ul>
        )}
      </section>
    </div>
  );
}
