import Link from "next/link";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { Award, CalendarDays, CalendarPlus, Droplet, FileBadge, History, IdCard, Settings, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { getGeo } from "@/lib/geo";
import { formatDate } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select } from "@/components/ui/input";
import { DonorCard } from "@/components/blood/donor-card";
import { CardActions } from "@/components/blood/card-actions";
import { DonorCalendar } from "@/components/blood/donor-calendar";
import { cancelDonation, declareDonation, deleteDonorSpace, issueCertificate, renewCardToken, saveDonorProfile } from "@/app/actions/donor";
import { BADGE_STYLE, BLOOD_GROUPS, DONATION_STATUS, DONATION_TYPES, NEXT_DATE_NOTICE, type Donation, type DonorProfile, type DonorSummary } from "@/lib/donor";

export const metadata = { title: "Mon espace donneur", description: "Suivre ses dons de sang, son calendrier, sa carte de donneur et ses distinctions.", robots: { index: false } };
export const dynamic = "force-dynamic";

const H2 = ({ id, icon: I, children }: { id: string; icon: typeof Droplet; children: React.ReactNode }) =>
  <h2 id={id} className="flex scroll-mt-24 items-center gap-2 text-lg font-bold text-brand-deep"><I className="size-5 text-red-600" aria-hidden />{children}</h2>;

async function siteUrl() {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

export default async function DonorSpace() {
  const session = await getSession();
  if (!session) {
    return (
      <div className="container-page max-w-xl py-10">
        <section className="space-y-3 rounded-2xl border bg-white p-6 text-center">
          <Droplet className="mx-auto size-10 fill-red-100 text-red-600" aria-hidden />
          <h1 className="text-xl font-bold text-brand-deep">Mon espace donneur</h1>
          <p className="text-sm text-muted-foreground">Suivez vos dons de sang, votre prochaine date indicative, votre carte de donneur et vos distinctions. Connectez-vous ou créez un compte gratuit pour commencer.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link prefetch={false} href="/connexion?suite=%2Fdon-de-sang%2Fmon-espace" className="inline-flex min-h-11 items-center rounded-xl bg-[#052D1E] px-5 font-semibold text-white">Se connecter</Link>
            <Link prefetch={false} href="/inscription?suite=%2Fdon-de-sang%2Fmon-espace" className="inline-flex min-h-11 items-center rounded-xl border-2 px-5 font-semibold">Créer un compte</Link>
          </div>
        </section>
      </div>
    );
  }
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: s }, { data: p }, { data: d }, { data: levels }, { data: camps }, { data: certs }, geo, { data: prof }] = await Promise.all([
    supabase.rpc("donor_summary"),
    supabase.from("blood_donor_profiles").select("donor_code, card_token, blood_group, blood_group_verified, sex, usual_center, region_id, status, card_show_name, card_show_last_donation, reminders, accepts_solicitations, created_at").eq("user_id", session.userId).maybeSingle(),
    supabase.from("blood_donations").select("id, reference, donated_on, center, donation_type, status, decision_note, decided_at, blood_campaigns(title)").eq("donor_id", session.userId).order("donated_on", { ascending: false }).limit(100),
    supabase.from("blood_badge_levels").select("code, label, threshold").order("threshold"),
    supabase.from("blood_campaigns").select("id, title, place, starts_on").eq("published", true).gte("starts_on", new Date(Date.now() - 240 * 86400_000).toISOString().slice(0, 10)).order("starts_on").limit(40),
    supabase.from("blood_certificates").select("reference, validated_count, issued_at").eq("user_id", session.userId).order("issued_at", { ascending: false }).limit(5),
    getGeo(),
    supabase.from("profiles").select("full_name").eq("id", session.userId).maybeSingle(),
  ]);
  const sum = (s ?? { exists: false }) as DonorSummary;
  const pr = p as DonorProfile | null;
  const regionOptions = geo.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>);

  if (!sum.exists || !pr) {
    return (
      <div className="container-page max-w-3xl space-y-5 py-6">
        <header className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-red-700">SantéProxi Solidaire · Donner. Mobiliser. Sauver.</p>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><Droplet className="size-7 fill-red-100 text-red-600" aria-hidden /> Mon espace donneur</h1>
          <p className="text-muted-foreground">Un espace personnel pour garder la trace de vos dons, connaître votre prochaine date indicative de don, obtenir votre carte de donneur et vos distinctions.</p>
        </header>
        <ul className="grid gap-3 sm:grid-cols-3 text-sm">
          {[[History, "Vos dons", "Chaque don est compté après validation par le centre de collecte."], [CalendarDays, "Votre calendrier", "Prochaine date indicative et collectes annoncées."], [IdCard, "Votre carte", "Une carte à télécharger, avec un QR code sans donnée médicale."]].map(([I, t, x]) => {
            const Icon = I as typeof Droplet;
            return <li key={t as string} className="rounded-2xl border bg-white p-4"><Icon className="mb-1 size-5 text-red-600" aria-hidden /><p className="font-semibold">{t as string}</p><p className="text-muted-foreground">{x as string}</p></li>;
          })}
        </ul>
        <section className="rounded-2xl border bg-white p-5">
          <h2 className="mb-3 text-lg font-bold text-brand-deep">Créer mon espace donneur</h2>
          <ActionForm action={saveDonorProfile} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="creating" value="1" />
            <Field label="Mon groupe sanguin (si je le connais)" htmlFor="bg"><Select id="bg" name="blood_group" defaultValue=""><option value="">Je ne sais pas</option>{BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}</Select></Field>
            <Field label="Je suis" htmlFor="sx" hint="Sert uniquement à calculer la date indicative de prochain don."><Select id="sx" name="sex" defaultValue=""><option value="">Je préfère ne pas le dire</option><option value="F">Une femme</option><option value="M">Un homme</option></Select></Field>
            <Field label="Mon centre de collecte habituel (facultatif)" htmlFor="uc"><Input id="uc" name="usual_center" maxLength={160} placeholder="ex. CNTS Quinzambougou" /></Field>
            <Field label="Ma région (facultatif)" htmlFor="rg"><Select id="rg" name="region_id" defaultValue=""><option value="">—</option>{regionOptions}</Select></Field>
            <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="reminders" defaultChecked className="mt-1 size-4" /> Me prévenir dans SantéProxi quand ma date indicative de prochain don arrive</label>
            <label className="flex items-start gap-2 rounded-xl bg-muted/50 p-3 text-sm sm:col-span-2"><input type="checkbox" name="consent" required className="mt-1 size-4" />
              <span>J&apos;accepte que SantéProxi enregistre ces informations pour tenir mon espace donneur. Mon groupe sanguin n&apos;est jamais rendu public. Je peux tout supprimer à tout moment.</span></label>
            <div className="sm:col-span-2"><SubmitButton>Créer mon espace</SubmitButton></div>
          </ActionForm>
        </section>
      </div>
    );
  }

  const donations = (d ?? []) as unknown as Donation[];
  const qrSvg = await QRCode.toString(`${await siteUrl()}/don-de-sang/carte/${pr.card_token}`, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  const badgeLevels = (levels ?? []) as { code: string; label: string; threshold: number }[];
  const campaigns = (camps ?? []) as { id: string; title: string; place: string; starts_on: string }[];
  const marks = [
    ...donations.filter((x) => x.status !== "refuse").map((x) => ({ date: x.donated_on, kind: x.status as "valide" | "en_attente", label: `Don ${DONATION_STATUS[x.status][0].toLowerCase()} — ${x.center}` })),
    ...campaigns.map((c) => ({ date: c.starts_on, kind: "collecte" as const, label: `Collecte : ${c.title}` })),
    ...(sum.next_indicative ? [{ date: sum.next_indicative, kind: "prochain" as const, label: "Date indicative de prochain don" }] : []),
  ];
  const upcoming = campaigns.filter((c) => c.starts_on >= today);
  const canGive = !sum.next_indicative || sum.next_indicative <= today;

  return (
    <div className="container-page max-w-5xl space-y-6 py-6">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-red-700">SantéProxi Solidaire · Donner. Mobiliser. Sauver.</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><Droplet className="size-7 fill-red-100 text-red-600" aria-hidden /> Mon espace donneur</h1>
        <nav aria-label="Sections" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 text-sm">
          {[["#profil", "Profil"], ["#carte", "Ma carte"], ["#distinctions", "Distinctions"], ["#calendrier", "Calendrier"], ["#historique", "Historique"], ["#certificat", "Certificat"], ["#parametres", "Paramètres"]].map(([h, l]) =>
            <a key={h} href={h} className="shrink-0 rounded-full border bg-white px-3 py-1.5 font-medium hover:border-red-400">{l}</a>)}
        </nav>
      </header>

      {/* 1. Profil */}
      <section aria-labelledby="profil" className="space-y-3">
        <H2 id="profil" icon={Droplet}>Mon profil donneur</H2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["Groupe sanguin", pr.blood_group ? `${pr.blood_group}${pr.blood_group_verified ? " ✓" : ""}` : "Non renseigné", pr.blood_group ? (pr.blood_group_verified ? "Confirmé par un centre" : "Déclaré, à confirmer") : "Le centre vous le donnera"],
            ["Dernier don", sum.last_declared ? formatDate(sum.last_declared) : "Aucun", sum.last_validated && sum.last_validated === sum.last_declared ? "Validé" : sum.last_declared ? "En attente de validation" : "Enregistrez votre premier don"],
            ["Dons validés", String(sum.validated_count), sum.pending_count ? `${sum.pending_count} en attente` : "Comptés après validation"],
            ["Centre habituel", pr.usual_center ?? "—", "Modifiable dans les paramètres"],
            ["Statut", pr.status === "actif" ? "Actif" : "En pause", canGive ? "Vous pouvez envisager un don" : `Prochain don indicatif le ${formatDate(sum.next_indicative!)}`],
          ].map(([t, v, h]) => (
            <div key={t} className="rounded-2xl border bg-white p-3"><dt className="text-xs text-muted-foreground">{t}</dt><dd className="text-lg font-bold text-brand-deep">{v}</dd><dd className="text-xs text-muted-foreground">{h}</dd></div>
          ))}
        </dl>
      </section>

      {/* 2. Carte */}
      <section aria-labelledby="carte" className="space-y-3">
        <H2 id="carte" icon={IdCard}>Ma carte numérique de donneur</H2>
        <div className="grid items-start gap-5 md:grid-cols-[auto_1fr]">
          <DonorCard name={pr.card_show_name ? (prof?.full_name as string | null) ?? null : null} code={pr.donor_code} group={pr.blood_group} groupVerified={pr.blood_group_verified}
            count={sum.validated_count} badge={sum.badge.current} since={pr.created_at} lastDonation={pr.card_show_last_donation ? sum.last_validated : null} qrSvg={qrSvg} />
          <div className="space-y-3 text-sm">
            <CardActions hasGroup={!!pr.blood_group && pr.blood_group_verified} />
            <p className="flex items-start gap-2 rounded-xl bg-brand-mint p-3 text-brand-deep"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />Le QR code ne contient aucune donnée médicale : seulement un lien. La personne qui le scanne doit être connectée ; elle voit l&apos;authenticité de la carte et le nombre de dons validés. Votre groupe sanguin n&apos;est visible que de vous et du CNTS.</p>
            <p className="text-muted-foreground">Votre nom et la date de votre dernier don n&apos;apparaissent que si vous l&apos;acceptez (Paramètres).</p>
            <Link prefetch={false} href={`/don-de-sang/carte/${pr.card_token}`} className="inline-block text-primary underline">Voir la page ouverte par le QR code</Link>
            <ActionForm action={renewCardToken}><SubmitButton size="sm" variant="outline" confirm="Créer un nouveau QR code ? L'ancien ne fonctionnera plus.">Créer un nouveau QR code</SubmitButton></ActionForm>
          </div>
        </div>
      </section>

      {/* 3. Distinctions */}
      <section aria-labelledby="distinctions" className="space-y-3">
        <H2 id="distinctions" icon={Award}>Mes distinctions</H2>
        <p className="text-sm text-muted-foreground">Des reconnaissances symboliques, attribuées automatiquement à partir des seuls dons validés. Le don de sang reste gratuit : ces distinctions n&apos;ont aucune valeur marchande.</p>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {badgeLevels.map((b) => {
            const got = sum.validated_count >= b.threshold;
            return (
              <li key={b.code} className={`flex flex-col items-center rounded-2xl border p-3 text-center ${got ? "bg-white" : "bg-muted/40 opacity-70"}`}>
                <span className={`flex size-14 items-center justify-center rounded-full bg-gradient-to-br text-lg font-black ${got ? BADGE_STYLE[b.code] : "from-slate-100 to-slate-200 text-slate-500"}`}>{b.threshold}</span>
                <span className="mt-2 text-sm font-semibold">{b.label}</span>
                <span className="text-xs text-muted-foreground">{got ? "Obtenue" : `${b.threshold - sum.validated_count} don${b.threshold - sum.validated_count > 1 ? "s" : ""} validé${b.threshold - sum.validated_count > 1 ? "s" : ""} de plus`}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 4. Calendrier */}
      <section aria-labelledby="calendrier" className="space-y-3">
        <H2 id="calendrier" icon={CalendarDays}>Mon calendrier de don</H2>
        <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4 text-sm">
          {sum.next_indicative ? (
            <p className="text-base"><strong>{sum.next_indicative <= today ? "Vous pouvez envisager un nouveau don" : `Prochain don indicatif : ${formatDate(sum.next_indicative)}`}</strong></p>
          ) : <p className="text-base"><strong>Enregistrez votre dernier don pour connaître votre date indicative.</strong></p>}
          <p className="mt-1">{NEXT_DATE_NOTICE}</p>
          <p className="mt-1 text-xs text-muted-foreground">Délai utilisé : {sum.interval_months} mois{sum.interval_sex_known ? "" : " (délai le plus long, faute de précision dans votre profil)"} pour un don de sang total. {sum.intervals_confirmed ? "Délais confirmés par le CNTS." : "Délais de référence au Mali (3 mois pour les hommes, 4 mois pour les femmes), en attente de confirmation officielle par le CNTS."}</p>
          {sum.next_indicative && sum.next_indicative > today && <a href="/don-de-sang/mon-espace/rappel" className="mt-2 inline-flex items-center gap-1.5 font-semibold text-primary underline"><CalendarPlus className="size-4" aria-hidden /> Ajouter cette date au calendrier de mon téléphone</a>}
          <p className="mt-1 text-xs">{pr.reminders ? "Rappel activé : vous recevrez une notification SantéProxi à cette date." : "Rappel désactivé (Paramètres)."}</p>
        </div>
        <DonorCalendar marks={marks} today={today} />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border bg-white p-4 text-sm">
            <p className="font-semibold">Collectes annoncées</p>
            {upcoming.length === 0 ? <p className="mt-1 text-muted-foreground">Aucune collecte mobile annoncée pour le moment. Le CNTS reçoit les donneurs toute l&apos;année.</p> : (
              <ul className="mt-1 space-y-1">{upcoming.slice(0, 6).map((c) => <li key={c.id}><strong>{formatDate(c.starts_on)}</strong> — {c.title}, {c.place}</li>)}</ul>
            )}
            <Link prefetch={false} href="/don-de-sang#campagnes" className="mt-2 inline-block text-primary underline">Voir les collectes et dire « j&apos;y serai »</Link>
          </div>
          <div className="rounded-2xl border bg-white p-4 text-sm">
            <p className="font-semibold">Où donner ?</p>
            <p className="mt-1">Centre national de transfusion sanguine (CNTS), Quinzambougou, Bamako — lundi au vendredi, 8 h – 14 h, et ses sites de collecte dans les hôpitaux.</p>
            <Link prefetch={false} href="/don-de-sang#ou-donner" className="mt-2 inline-block text-primary underline">Liste des sites de collecte</Link>
          </div>
        </div>
      </section>

      {/* 5. Historique */}
      <section aria-labelledby="historique" className="space-y-3">
        <H2 id="historique" icon={History}>Mon historique</H2>
        <details className="rounded-2xl border bg-white p-4" open={donations.length === 0}>
          <summary className="cursor-pointer font-semibold text-primary">Enregistrer un don</summary>
          <ActionForm action={declareDonation} resetOnSuccess className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Date du don" htmlFor="dd" required><Input id="dd" type="date" name="donated_on" max={today} required /></Field>
            <Field label="Type de don" htmlFor="dt"><Select id="dt" name="donation_type" defaultValue="sang_total">{Object.entries(DONATION_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="Centre ou lieu de collecte" htmlFor="dc" required><Input id="dc" name="center" maxLength={160} required defaultValue={pr.usual_center ?? ""} placeholder="ex. CNTS Quinzambougou" /></Field>
            <Field label="Lors d'une collecte annoncée (facultatif)" htmlFor="dcp"><Select id="dcp" name="campaign_id" defaultValue=""><option value="">Non</option>{campaigns.filter((c) => c.starts_on <= today).reverse().map((c) => <option key={c.id} value={c.id}>{formatDate(c.starts_on)} — {c.title}</option>)}</Select></Field>
            <p className="text-xs text-muted-foreground sm:col-span-2">Votre don est d&apos;abord « en attente » : il est compté (distinctions, certificat, statistiques) seulement après sa validation par le CNTS ou un centre habilité.</p>
            <div className="sm:col-span-2"><SubmitButton>Enregistrer</SubmitButton></div>
          </ActionForm>
        </details>
        {donations.length === 0 ? <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Aucun don enregistré pour l&apos;instant.</p> : (
          <ol className="relative space-y-3 border-s-2 border-red-200 ps-5">
            {donations.map((x) => (
              <li key={x.id} className="relative rounded-2xl border bg-white p-3 text-sm">
                <span className={`absolute -start-[1.65rem] top-4 size-3 rounded-full ${x.status === "valide" ? "bg-red-600" : x.status === "en_attente" ? "bg-amber-400" : "bg-slate-300"}`} aria-hidden />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{formatDate(x.donated_on)} · {DONATION_TYPES[x.donation_type]}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${DONATION_STATUS[x.status][1]}`}>{DONATION_STATUS[x.status][0]}</span>
                </div>
                <p>{x.center}{x.blood_campaigns ? ` — ${x.blood_campaigns.title}` : ""}</p>
                <p className="text-xs text-muted-foreground" dir="ltr">{x.reference}</p>
                {x.decision_note && <p className="mt-1 text-xs">Note du centre : {x.decision_note}</p>}
                {x.status === "en_attente" && <ActionForm action={cancelDonation} className="mt-1"><input type="hidden" name="id" value={x.id} /><SubmitButton size="sm" variant="ghost">Retirer (erreur de saisie)</SubmitButton></ActionForm>}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Certificat */}
      <section aria-labelledby="certificat" className="space-y-3">
        <H2 id="certificat" icon={FileBadge}>Certificat de reconnaissance</H2>
        <div className="rounded-2xl border bg-white p-4 text-sm">
          {sum.validated_count === 0 ? <p className="text-muted-foreground">Disponible après la validation de votre premier don.</p> : (
            <ActionForm action={issueCertificate} className="space-y-2">
              <p>Un certificat numérique avec un identifiant de vérification, à imprimer ou à envoyer. Il indique le nombre de dons validés et la période concernée.</p>
              <label className="flex items-center gap-2"><input type="checkbox" name="show_name" className="size-4" /> Faire figurer mon nom sur le certificat</label>
              <SubmitButton size="sm">Obtenir mon certificat</SubmitButton>
            </ActionForm>
          )}
          {(certs ?? []).length > 0 && <ul className="mt-3 space-y-1 text-xs">{(certs ?? []).map((c) => <li key={c.reference}><Link prefetch={false} href={`/don-de-sang/certificat/${c.reference}`} className="text-primary underline">{c.reference}</Link> — {c.validated_count} don(s), {formatDate(c.issued_at)}</li>)}</ul>}
        </div>
      </section>

      {/* Paramètres */}
      <section aria-labelledby="parametres" className="space-y-3">
        <H2 id="parametres" icon={Settings}>Paramètres et confidentialité</H2>
        <ActionForm action={saveDonorProfile} className="grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-2">
          <Field label="Groupe sanguin" htmlFor="pbg" hint={pr.blood_group_verified ? "Confirmé par un centre : le modifier retire la confirmation." : undefined}><Select id="pbg" name="blood_group" defaultValue={pr.blood_group ?? ""}><option value="">Je ne sais pas</option>{BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}</Select></Field>
          <Field label="Je suis" htmlFor="psx"><Select id="psx" name="sex" defaultValue={pr.sex ?? ""}><option value="">Je préfère ne pas le dire</option><option value="F">Une femme</option><option value="M">Un homme</option></Select></Field>
          <Field label="Centre de collecte habituel" htmlFor="puc"><Input id="puc" name="usual_center" maxLength={160} defaultValue={pr.usual_center ?? ""} /></Field>
          <Field label="Région" htmlFor="prg"><Select id="prg" name="region_id" defaultValue={pr.region_id ?? ""}><option value="">—</option>{regionOptions}</Select></Field>
          <Field label="Statut" htmlFor="pst"><Select id="pst" name="status" defaultValue={pr.status}><option value="actif">Actif</option><option value="pause">En pause (plus de rappels)</option></Select></Field>
          <div className="space-y-2 text-sm sm:col-span-2">
            <label className="flex items-start gap-2"><input type="checkbox" name="card_show_name" defaultChecked={pr.card_show_name} className="mt-1 size-4" /> Afficher mon nom sur ma carte</label>
            <label className="flex items-start gap-2"><input type="checkbox" name="card_show_last_donation" defaultChecked={pr.card_show_last_donation} className="mt-1 size-4" /> Afficher la date de mon dernier don validé sur ma carte</label>
            <label className="flex items-start gap-2"><input type="checkbox" name="reminders" defaultChecked={pr.reminders} className="mt-1 size-4" /> Me rappeler ma date indicative de prochain don</label>
            <label className="flex items-start gap-2"><input type="checkbox" name="accepts_solicitations" defaultChecked={pr.accepts_solicitations} className="mt-1 size-4" /> J&apos;accepte d&apos;être sollicité(e) lors d&apos;un besoin de sang vérifié près de chez moi (fonction en préparation avec le CNTS)</label>
          </div>
          <div className="sm:col-span-2"><SubmitButton size="sm">Enregistrer</SubmitButton></div>
        </ActionForm>
        <details className="rounded-2xl border border-red-200 bg-white p-4 text-sm">
          <summary className="cursor-pointer font-semibold text-red-700">Supprimer mon espace donneur</summary>
          <ActionForm action={deleteDonorSpace} className="mt-2 flex flex-wrap items-end gap-2">
            <p className="w-full">Tout sera effacé : profil, historique, distinctions, certificats, QR code. Cette action est définitive.</p>
            <Field label="Écrivez SUPPRIMER" htmlFor="cf"><Input id="cf" name="confirm" autoComplete="off" /></Field>
            <SubmitButton size="sm" variant="outline" className="text-destructive">Supprimer définitivement</SubmitButton>
          </ActionForm>
        </details>
      </section>
    </div>
  );
}
