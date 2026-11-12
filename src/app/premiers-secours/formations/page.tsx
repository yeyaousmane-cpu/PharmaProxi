import Link from "next/link";
import { ExternalLink, GraduationCap, Mail, MapPin, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { getGeo } from "@/lib/geo";
import { formatDate, formatPhone } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Input, Select, Textarea } from "@/components/ui/input";
import { registerTraining, setRegistrationStatus } from "@/app/actions/v037";
import { AUDIENCE, PARTNERSHIP, REG_STATUS } from "@/lib/first-aid";

export const metadata = { title: "Formations aux premiers secours", description: "Organismes de formation aux premiers secours au Mali, sessions publiées et demandes d'inscription." };
export const dynamic = "force-dynamic";

type Org = { id: string; slug: string; name: string; kind: string; description: string | null; website: string | null; phones: string[]; email: string | null; address: string | null; coverage: string | null;
  trainings: string | null; registration_url: string | null; registration_label: string | null; partnership_status: string; source: string; source_url: string | null; verified_at: string | null };
type Course = { id: string; organization_id: string; title: string; description: string | null; place: string | null; starts_on: string; ends_on: string | null; capacity: number | null; conditions: string | null; registration_url: string | null; regions: { name: string } | null };
type Reg = { id: string; reference: string; status: string; status_note: string | null; created_at: string; first_aid_organizations: { name: string } | null; first_aid_courses: { title: string; starts_on: string } | null };

export default async function Formations() {
  const session = await getSession();
  const supabase = await createClient();
  const geo = await getGeo();
  const [o, c, r] = await Promise.all([
    supabase.from("first_aid_organizations").select("id, slug, name, kind, description, website, phones, email, address, coverage, trainings, registration_url, registration_label, partnership_status, source, source_url, verified_at").eq("published", true).order("name"),
    supabase.from("first_aid_courses").select("id, organization_id, title, description, place, starts_on, ends_on, capacity, conditions, registration_url, regions(name)").eq("status", "publiee").gte("starts_on", new Date().toISOString().slice(0, 10)).order("starts_on"),
    session ? supabase.from("first_aid_registrations").select("id, reference, status, status_note, created_at, first_aid_organizations(name), first_aid_courses(title, starts_on)").eq("user_id", session.userId).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const orgs = (o.data ?? []) as Org[]; const courses = (c.data ?? []) as unknown as Course[]; const regs = (r.data ?? []) as unknown as Reg[];
  return (
    <div className="container-page max-w-4xl space-y-5 py-6">
      <p className="text-sm"><Link prefetch={false} href="/premiers-secours" className="text-primary underline">← Premiers secours</Link></p>
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><GraduationCap className="size-7 text-red-600" aria-hidden /> Se former aux premiers secours</h1>
        <p className="text-muted-foreground">Les organismes ci-dessous sont présentés à titre d&apos;information. SantéProxi n&apos;a signé aucun accord avec eux tant que leur fiche ne l&apos;indique pas. Quand un organisme a son propre formulaire, utilisez-le en priorité.</p>
      </header>

      <section aria-labelledby="sessions" className="space-y-2">
        <h2 id="sessions" className="text-lg font-bold text-brand-deep">Prochaines sessions publiées</h2>
        {courses.length === 0 ? <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Aucune session n&apos;est publiée pour le moment. Les organismes habilités publient leurs sessions dans SantéProxi après validation ; en attendant, contactez-les directement ou envoyez une demande ci-dessous.</p> : (
          <ul className="grid gap-3 sm:grid-cols-2">{courses.map((x) => (
            <li key={x.id} className="space-y-1 rounded-2xl border bg-white p-4 text-sm">
              <p className="font-bold">{x.title}</p>
              <p>{orgs.find((g) => g.id === x.organization_id)?.name} · {formatDate(x.starts_on)}{x.ends_on ? ` au ${formatDate(x.ends_on)}` : ""}</p>
              <p className="text-muted-foreground"><MapPin className="me-1 inline size-3.5" aria-hidden />{[x.place, x.regions?.name].filter(Boolean).join(", ") || "Lieu à préciser"}{x.capacity ? ` · ${x.capacity} places` : ""}</p>
              {x.conditions && <p className="text-xs">{x.conditions}</p>}
              {x.registration_url && <a href={x.registration_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary underline">S&apos;inscrire sur le site de l&apos;organisme <ExternalLink className="size-3" aria-hidden /></a>}
            </li>))}</ul>)}
      </section>

      <section aria-labelledby="orgs" className="space-y-3">
        <h2 id="orgs" className="text-lg font-bold text-brand-deep">Organismes de formation</h2>
        {orgs.map((g) => (
          <article key={g.id} className="space-y-2 rounded-2xl border bg-white p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-bold">{g.name}</h3><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PARTNERSHIP[g.partnership_status][1]}`}>{PARTNERSHIP[g.partnership_status][0]}</span></div>
            {g.description && <p>{g.description}</p>}
            {g.trainings && <p><strong>Formations : </strong>{g.trainings}</p>}
            {g.coverage && <p><strong>Zones : </strong>{g.coverage}</p>}
            <div className="flex flex-wrap gap-2">
              {g.phones.map((ph) => <a key={ph} href={`tel:${ph}`} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-[#052D1E] px-3 font-semibold text-white"><Phone className="size-4" aria-hidden />{formatPhone(ph)}</a>)}
              {g.email && <a href={`mailto:${g.email}`} className="inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 font-semibold"><Mail className="size-4" aria-hidden />{g.email}</a>}
              {g.website && <a href={g.website} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 font-semibold">Site officiel <ExternalLink className="size-3" aria-hidden /></a>}
              {g.registration_url && <a href={g.registration_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 rounded-lg border-2 border-red-700 px-3 font-semibold text-red-800">{g.registration_label ?? "Formulaire officiel"} <ExternalLink className="size-3" aria-hidden /></a>}
            </div>
            {g.address && <p className="text-xs text-muted-foreground">{g.address}</p>}
            <p className="text-xs text-muted-foreground">Source : {g.source_url ? <a href={g.source_url} target="_blank" rel="noopener noreferrer" className="underline">{g.source}</a> : g.source}</p>
          </article>))}
      </section>

      <section aria-labelledby="inscr" className="space-y-3 rounded-2xl border bg-white p-4">
        <h2 id="inscr" className="text-lg font-bold text-brand-deep">S&apos;inscrire à une formation (demande de mise en relation)</h2>
        <p className="text-sm text-muted-foreground">Votre demande est transmise aux membres habilités de l&apos;organisme dans SantéProxi (aucun SMS ni e-mail automatique). Votre numéro ne leur est communiqué que si vous l&apos;acceptez.</p>
        {!session ? <p className="text-sm"><Link prefetch={false} href="/connexion?suite=%2Fpremiers-secours%2Fformations" className="font-semibold text-primary underline">Connectez-vous</Link> pour envoyer une demande.</p> : (
          <ActionForm action={registerTraining} className="grid gap-3 text-sm sm:grid-cols-2">
            <label>Organisme<Select name="organization_id" required defaultValue="" className="mt-1 h-11"><option value="" disabled>Choisir</option>{orgs.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></label>
            <label>Session (facultatif)<Select name="course_id" defaultValue="" className="mt-1 h-11"><option value="">Pas de session précise</option>{courses.map((x) => <option key={x.id} value={x.id}>{x.title} — {formatDate(x.starts_on)}</option>)}</Select></label>
            <label>Région<Select name="region_id" defaultValue="" className="mt-1 h-11"><option value="">—</option>{geo.regions.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></label>
            <label>Ville ou localité<Input name="locality" maxLength={120} className="mt-1 h-11" /></label>
            <label>Vous êtes<Select name="audience" defaultValue="individuel" className="mt-1 h-11">{Object.entries(AUDIENCE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
            <label className="sm:col-span-2">Message (facultatif)<Textarea name="message" maxLength={500} rows={2} className="mt-1" placeholder="ex. groupe de 15 étudiants, disponibles le samedi" /></label>
            <label className="flex items-start gap-2 sm:col-span-2"><input type="checkbox" name="share_contact" className="mt-1 size-4" /> J&apos;accepte que l&apos;organisme voie mon nom et mon numéro de téléphone pour me recontacter.</label>
            <div><SubmitButton>Envoyer ma demande</SubmitButton></div>
          </ActionForm>
        )}
      </section>

      {regs.length > 0 && (
        <section id="mes-demandes" aria-labelledby="md" className="space-y-2">
          <h2 id="md" className="text-lg font-bold text-brand-deep">Mes demandes</h2>
          <ul className="space-y-2">{regs.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-white p-3 text-sm">
              <span><span className="font-mono text-xs">{x.reference}</span> · {x.first_aid_organizations?.name}{x.first_aid_courses ? ` · ${x.first_aid_courses.title}` : ""} · <strong>{REG_STATUS[x.status]}</strong>{x.status_note ? ` — ${x.status_note}` : ""}</span>
              {["envoyee", "en_attente", "confirmee"].includes(x.status) && <ActionForm action={setRegistrationStatus}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="status" value="annulee" /><SubmitButton size="sm" variant="outline">Annuler</SubmitButton></ActionForm>}
            </li>))}</ul>
        </section>
      )}
    </div>
  );
}
