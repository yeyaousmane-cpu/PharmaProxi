import Link from "next/link";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { Award, BookUser, CalendarDays, Megaphone, Share2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { BloodNav } from "@/components/blood/blood-nav";
import { PrintButton } from "@/components/blood/print-button";
import { setPassportPublic } from "@/app/actions/donor";
import { BADGE_STYLE, DONATION_TYPES } from "@/lib/donor";

export const metadata = { title: "Mon passeport solidaire", robots: { index: false } };
export const dynamic = "force-dynamic";

async function siteUrl() {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}
const H2 = ({ icon: I, children }: { icon: typeof Award; children: React.ReactNode }) => <h2 className="flex items-center gap-2 text-lg font-bold text-brand-deep"><I className="size-5 text-red-600" aria-hidden />{children}</h2>;

export default async function Passport() {
  const session = await getSession();
  if (!session) return <div className="container-page max-w-xl py-10 text-center"><p>Mon passeport solidaire retrace votre engagement : dons validés, distinctions, collectes. <Link prefetch={false} href="/connexion?suite=%2Fdon-de-sang%2Fpasseport" className="font-semibold text-primary underline">Connectez-vous</Link>.</p></div>;
  const supabase = await createClient();
  const [{ data: p }, { data: prof }, { data: dons }, { data: levels }, { data: certs }, { data: att }, validator] = await Promise.all([
    supabase.from("blood_donor_profiles").select("donor_code, created_at, card_show_name, passport_token, passport_public").eq("user_id", session.userId).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", session.userId).maybeSingle(),
    supabase.from("blood_donations").select("id, donated_on, center, donation_type, blood_campaigns(title, organizer, place)").eq("donor_id", session.userId).eq("status", "valide").order("donated_on", { ascending: false }),
    supabase.from("blood_badge_levels").select("code, label, threshold").order("threshold"),
    supabase.from("blood_certificates").select("reference, validated_count, issued_at").eq("user_id", session.userId).order("issued_at", { ascending: false }),
    supabase.from("blood_campaign_attendance").select("created_at, blood_campaigns(title, starts_on, place)").eq("user_id", session.userId),
    supabase.rpc("is_blood_validator").then((r) => !!r.data),
  ]);
  if (!p) return <div className="container-page max-w-xl py-10 text-center"><p>Créez d&apos;abord votre <Link prefetch={false} href="/don-de-sang/mon-espace" className="font-semibold text-primary underline">espace donneur</Link> : votre passeport solidaire se remplira avec vos dons validés.</p></div>;
  type D = { id: string; donated_on: string; center: string; donation_type: string; blood_campaigns: { title: string; organizer: string; place: string } | null };
  const donations = (dons ?? []) as unknown as D[];
  const n = donations.length;
  const byYear = donations.reduce<Record<string, number>>((a, d) => { const y = d.donated_on.slice(0, 4); a[y] = (a[y] ?? 0) + 1; return a; }, {});
  const years = Object.keys(byYear).sort();
  const max = Math.max(1, ...Object.values(byYear));
  const campaigns = donations.filter((d) => d.blood_campaigns);
  const intentions = ((att ?? []) as unknown as { created_at: string; blood_campaigns: { title: string; starts_on: string; place: string } | null }[]).filter((a) => a.blood_campaigns);
  const publicUrl = `${await siteUrl()}/don-de-sang/passeport/${p.passport_token}`;
  const qr = p.passport_public ? await QRCode.toString(publicUrl, { type: "svg", margin: 0 }) : null;
  return (
    <div className="container-page max-w-4xl space-y-5 py-6 print:max-w-none">
      <div className="print:hidden"><BloodNav current="/don-de-sang/passeport" validator={validator} /></div>
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-3xl bg-gradient-to-br from-[#7f1d1d] via-[#b91c1c] to-[#052D1E] p-5 text-white print:bg-none print:text-black print:border">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-white/80 print:text-black">Mon passeport solidaire – SantéProxi</p>
          <h1 className="text-2xl font-extrabold">{p.card_show_name ? prof?.full_name ?? "Donneur volontaire" : "Donneur volontaire"}</h1>
          <p className="text-sm text-white/90 print:text-black">Identifiant <span className="font-mono" dir="ltr">{p.donor_code}</span> · inscrit le {formatDate(p.created_at)}</p>
        </div>
        <div className="text-end"><p className="text-4xl font-black">{n}</p><p className="text-xs text-white/80 print:text-black">don{n > 1 ? "s" : ""} validé{n > 1 ? "s" : ""}</p></div>
      </header>
      <p className="text-xs text-muted-foreground">Ce passeport retrace un engagement citoyen. Ce n&apos;est ni un document médical, ni une pièce d&apos;identité officielle. Il ne contient aucune donnée de santé : ni groupe sanguin, ni vaccination, ni dossier médical.</p>

      <section className="space-y-2"><H2 icon={CalendarDays}>Mon parcours de donneur</H2>
        {n === 0 ? <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Vos dons apparaîtront ici après leur validation par le centre de collecte.</p> : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border bg-white p-4"><p className="mb-2 text-sm font-semibold">Évolution par année</p>
              <ul className="space-y-1.5">{years.map((y) => <li key={y} className="flex items-center gap-2 text-sm"><span className="w-12 shrink-0">{y}</span><span className="h-4 rounded bg-red-600" style={{ width: `${(byYear[y] / max) * 100}%` }} aria-hidden /><span className="font-semibold">{byYear[y]}</span></li>)}</ul></div>
            <ol className="max-h-72 space-y-2 overflow-y-auto rounded-2xl border bg-white p-4 text-sm print:max-h-none">{donations.map((d) => <li key={d.id}><strong>{formatDate(d.donated_on)}</strong> · {DONATION_TYPES[d.donation_type]} · {d.center}</li>)}</ol>
          </div>)}
      </section>

      <section className="space-y-2"><H2 icon={Award}>Mes distinctions</H2>
        <ul className="flex flex-wrap gap-2">{(levels ?? []).filter((l) => l.threshold <= n).map((l) => <li key={l.code} className={`rounded-full bg-gradient-to-r px-3 py-1 text-sm font-bold ${BADGE_STYLE[l.code] ?? ""}`}>{l.label}</li>)}
          {n === 0 && <li className="text-sm text-muted-foreground">Première distinction après votre premier don validé.</li>}</ul>
        {(certs ?? []).length > 0 && <p className="text-sm">Certificats : {(certs ?? []).map((c, i) => <span key={c.reference}>{i ? ", " : ""}<Link prefetch={false} href={`/don-de-sang/certificat/${c.reference}`} className="text-primary underline">{c.reference}</Link></span>)}</p>}
      </section>

      <section className="space-y-2"><H2 icon={Users}>Mes campagnes</H2>
        {campaigns.length === 0 && intentions.length === 0 ? <p className="text-sm text-muted-foreground">Aucune collecte pour l&apos;instant.</p> : (
          <ul className="space-y-1 text-sm">
            {campaigns.map((d) => <li key={d.id}>✔ <strong>{d.blood_campaigns!.title}</strong> ({d.blood_campaigns!.organizer}) — {d.blood_campaigns!.place}, {formatDate(d.donated_on)} · don validé</li>)}
            {intentions.map((a, i) => <li key={i} className="text-muted-foreground">○ {a.blood_campaigns!.title} — {formatDate(a.blood_campaigns!.starts_on)} · « j&apos;y serai » (intention, ce n&apos;est pas un don)</li>)}
          </ul>)}
      </section>

      <section className="space-y-2"><H2 icon={Megaphone}>Mon engagement citoyen</H2>
        <p className="text-sm text-muted-foreground">D&apos;autres actions (sensibilisation sanitaire, prévention, campagnes communautaires) pourront rejoindre ce passeport lorsqu&apos;elles seront attestées par une organisation partenaire.</p>
      </section>

      <section className="space-y-3 rounded-2xl border bg-white p-4 print:hidden"><H2 icon={Share2}>Partager ou télécharger</H2>
        <div className="flex flex-wrap items-start gap-4">
          <div className="space-y-2 text-sm">
            <p>Version publique limitée : nom (si vous l&apos;avez accepté sur votre carte), nombre de dons validés par année, distinctions. Jamais de groupe sanguin, de date précise ni de centre.</p>
            <ActionForm action={setPassportPublic}><input type="hidden" name="public" value={p.passport_public ? "0" : "1"} /><SubmitButton size="sm" variant={p.passport_public ? "outline" : "default"}>{p.passport_public ? "Désactiver la version publique" : "Activer la version publique"}</SubmitButton></ActionForm>
            {p.passport_public && <><p><Link prefetch={false} href={`/don-de-sang/passeport/${p.passport_token}`} className="break-all text-primary underline">{publicUrl}</Link></p>
              <ActionForm action={setPassportPublic}><input type="hidden" name="public" value="1" /><input type="hidden" name="renew" value="1" /><SubmitButton size="sm" variant="ghost" confirm="Créer un nouveau lien ? L'ancien ne fonctionnera plus.">Créer un nouveau lien</SubmitButton></ActionForm></>}
            <PrintButton />
          </div>
          {qr && <div className="rounded-xl border bg-white p-2 [&_svg]:size-32" role="img" aria-label="QR code de la version publique" dangerouslySetInnerHTML={{ __html: qr }} />}
        </div>
      </section>
      <p className="hidden items-center gap-1 text-xs print:flex"><BookUser className="size-3" aria-hidden />Imprimé depuis SantéProxi le {formatDate(new Date().toISOString())}.</p>
    </div>
  );
}
