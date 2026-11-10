import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { Ban, Bot, Building2, CheckCircle2, Eye, FileLock2, KeyRound, LockKeyhole, ScrollText, ServerCog, ShieldCheck, UserCheck } from "lucide-react";

export const metadata = {
  title: "Votre santé, vos données",
  description: "Comment SantéProxi protège vos informations personnelles et médicales, à quoi elles servent, qui peut y accéder et comment exercer vos droits.",
};

const UPDATED = "9 novembre 2026";

const commitments = [
  { Icon: LockKeyhole, t: "Protection des données personnelles", d: "Nous ne collectons que ce qui est nécessaire au service que vous utilisez." },
  { Icon: FileLock2, t: "Confidentialité des informations médicales", d: "Votre dossier santé n'est lisible que par vous et les personnes à qui vous ouvrez un accès." },
  { Icon: ScrollText, t: "Utilisation limitée", d: "Chaque donnée sert une finalité précise, présentée ci-dessous." },
  { Icon: KeyRound, t: "Contrôle des accès", d: "Des règles d'accès en base de données vérifient chaque lecture et chaque écriture." },
  { Icon: Eye, t: "Transparence", d: "Vous voyez vos consentements, vos demandes et l'historique des actions sensibles sur votre compte." },
  { Icon: Ban, t: "Aucune vente de données de santé", d: "SantéProxi ne vend pas vos données de santé et ne les utilise pas pour de la publicité." },
];

const uses: [string, string, string, string, string][] = [
  ["Création du compte", "Nom, téléphone et/ou e-mail, mot de passe (jamais stocké en clair)", "Vous identifier et sécuriser votre compte", "SantéProxi", "Jusqu'à la suppression du compte"],
  ["Rendez-vous médicaux", "Identité, contact, date, motif choisi, proche concerné le cas échéant", "Transmettre la demande et la confirmer", "Le médecin ou l'établissement choisi", "Durée du compte ; supprimable avec le compte"],
  ["Consultations", "SantéProxi ne réalise pas de consultation et n'enregistre pas de compte rendu de consultation", "—", "—", "—"],
  ["Téléconsultations", "Service non proposé à ce jour", "—", "—", "—"],
  ["Ordonnances", "Ordonnances que vous ajoutez vous-même à votre dossier santé (photo ou document)", "Les conserver et les retrouver facilement", "Vous ; les personnes à qui vous ouvrez un accès", "Jusqu'à leur suppression ou celle du compte"],
  ["Pharmacies", "Médicaments réservés, adresse de retrait, statut de la commande", "Préparer et suivre la réservation", "La pharmacie choisie", "Durée du compte"],
  ["Résultats de laboratoire", "Résultats déposés par le laboratoire auprès duquel vous avez fait une demande", "Vous permettre de les consulter", "Vous ; le laboratoire émetteur", "Jusqu'à leur suppression ou celle du compte"],
  ["Documents médicaux", "Documents que vous ajoutez à votre dossier santé", "Les conserver et les montrer si vous le décidez", "Vous ; les personnes à qui vous ouvrez un accès", "Jusqu'à leur suppression ou celle du compte"],
  ["Services de santé", "Recherches de médicaments ou de professionnels, alertes de disponibilité", "Afficher des résultats proches de vous", "SantéProxi", "Journal des recherches : 400 jours, sans lien avec votre identité dans les statistiques"],
  ["Notifications", "Préférences, notifications envoyées", "Vous informer de vos rendez-vous, commandes et alertes", "SantéProxi ; prestataire d'envoi d'e-mails", "Notifications lues : 180 jours"],
  ["Sécurité de la plateforme", "Identifiant, action réalisée, date", "Prévenir les abus et enquêter en cas d'incident", "Administrateurs habilités", "Journal d'audit protégé contre la modification"],
  ["Statistiques et amélioration", "Données agrégées et sans identité (nombre de recherches, disponibilités)", "Améliorer le service et informer la santé publique", "Partenaires institutionnels, sous forme agrégée uniquement", "Aucune donnée de santé individuelle n'entre dans les statistiques"],
];

const protections: [string, string, boolean][] = [
  ["Chiffrement", "Toutes les communications passent par une connexion chiffrée (HTTPS). La base de données est chiffrée au repos par notre hébergeur. Les notes de l'espace Femme sont en plus chiffrées par SantéProxi (AES-256-GCM) avant d'être enregistrées.", true],
  ["Contrôle des accès", "Chaque table de la base est protégée par des règles d'accès par ligne : un utilisateur ne peut lire que ses propres données. Les administrateurs de SantéProxi n'ont pas d'accès aux dossiers santé, documents médicaux et données de l'espace Femme.", true],
  ["Authentification renforcée", "La double authentification est disponible pour tous les comptes et obligatoire pour l'administration et les autorités.", true],
  ["Protection des documents", "Les documents sont stockés dans des espaces privés et ne s'ouvrent que par des liens temporaires (quelques minutes).", true],
  ["Traçabilité", "Les actions sensibles sont inscrites dans un journal chaîné : l'application ne peut ni le modifier ni l'effacer, et toute altération directe est détectable.", true],
  ["Surveillance", "Erreurs et tentatives d'abus sont limitées et journalisées (limites de débit, contrôles anti-abus en base).", true],
  ["Sauvegardes", "La politique de sauvegarde dépend de l'offre de notre hébergeur de base de données ; un plan de sauvegarde chiffrée et de reprise d'activité est en cours de définition.", false],
  ["Gestion des incidents", "Une procédure de gestion et de notification des incidents est en cours de formalisation.", false],
];

const providers: [string, string, string][] = [
  ["Supabase (base de données, authentification, stockage)", "Hébergement des comptes et des données, région Union européenne (Irlande)", "Toutes les données du service, protégées par les règles d'accès décrites plus haut"],
  ["Vercel (hébergement du site)", "Affichage du site et exécution du code serveur", "Données en transit lors de l'utilisation du site"],
  ["Prestataire d'envoi d'e-mails", "Envoi des e-mails de compte, de rendez-vous et de notifications", "Adresse e-mail, contenu du message"],
  ["Anthropic (assistant santé)", "Génération des réponses de l'assistant, si vous l'utilisez", "Le texte de votre question, sans votre nom ni votre identifiant de compte"],
];

function Section({ id, letter, title, children }: { id: string; letter: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="scroll-mt-24 space-y-4">
      <h2 id={`${id}-t`} className="flex items-center gap-3 text-2xl font-extrabold text-[#052D1E]">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#068132] text-base text-white" aria-hidden>{letter}</span>{title}
      </h2>
      {children}
    </section>
  );
}

export const revalidate = 600;

type Recipient = { name: string; role: string; data_categories: string; country: string };
const ID_FIELDS: [string, string][] = [["privacy_controller_name", "Responsable du traitement"], ["privacy_controller_registration", "Immatriculation"], ["privacy_controller_address", "Adresse"],
  ["privacy_contact_email", "Contact confidentialité (e-mail)"], ["privacy_contact_phone", "Contact confidentialité (téléphone)"], ["privacy_dpo_name", "Correspondant à la protection des données"]];

export default async function YourDataPage() {
  let identity: Record<string, string> = {}; let recipients: Recipient[] = []; let policy: string | null = null;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const [i, r, v] = await Promise.all([supabase.rpc("privacy_identity"), supabase.from("third_party_recipients").select("name,role,data_categories,country").eq("active", true).order("sort"), supabase.rpc("current_policy_version")]);
    identity = (i.data as Record<string, string> | null) ?? {}; recipients = (r.data as Recipient[] | null) ?? []; policy = (v.data as string | null) ?? null;
  }
  const toc = [["engagements", "Nos engagements"], ["utilisation", "Comment utilisons-nous vos données ?"], ["protection", "Comment les protégeons-nous ?"], ["droits", "Vos droits et vos choix"], ["prestataires", "Nos prestataires"], ["ia", "IA et innovation"], ["conformite", "Conformité et transparence"]];
  return (
    <div>
      <header className="border-b bg-[#EAF6EE]">
        <div className="container-page max-w-4xl py-10 md:py-14">
          <p className="text-sm font-bold uppercase tracking-widest text-[#068132]">Confiance et confidentialité</p>
          <h1 className="mt-2 text-4xl font-extrabold text-[#052D1E] md:text-5xl">Votre santé, vos données.</h1>
          <p className="mt-4 max-w-3xl text-lg text-[#052D1E]/80">Votre confiance est essentielle. SantéProxi s&apos;engage à protéger vos informations personnelles et médicales, à encadrer leur utilisation et à vous donner une meilleure visibilité sur vos données.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link prefetch={false} href="/compte/confidentialite" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#068132] px-4 font-semibold text-white hover:bg-[#052D1E]"><UserCheck className="size-4" aria-hidden /> Gérer mes données</Link>
            <Link prefetch={false} href="/infos/confidentialite" className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#068132]/30 bg-white px-4 font-semibold text-[#052D1E]">Politique de confidentialité</Link>
          </div>
        </div>
      </header>

      <div className="container-page grid max-w-6xl gap-10 py-10 lg:grid-cols-[15rem_1fr]">
        <nav aria-label="Sommaire" className="hidden lg:block">
          <ol className="sticky top-24 space-y-2 text-sm">{toc.map(([id, l], i) => (
            <li key={id}><a href={`#${id}`} className="block rounded-lg px-2 py-1.5 hover:bg-[#EAF6EE]"><span className="font-bold text-[#068132]">{String.fromCharCode(65 + i)}.</span> {l}</a></li>))}</ol>
        </nav>

        <div className="min-w-0 space-y-14">
          <section aria-labelledby="responsable" className="space-y-3 rounded-2xl border bg-white p-5">
            <h2 id="responsable" className="text-xl font-extrabold text-[#052D1E]">Qui est responsable de vos données ?</h2>
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[16rem_1fr]">{ID_FIELDS.map(([k, l]) => (
              <div key={k} className="contents"><dt className="font-semibold">{l}</dt><dd>{identity[k] ? identity[k] : <span className="rounded bg-amber-100 px-1.5 text-amber-900">À compléter</span>}</dd></div>))}</dl>
            <p className="text-xs text-muted-foreground">Les informations « À compléter » sont en cours de formalisation et seront publiées dès leur validation. En attendant, écrivez-nous depuis le <Link prefetch={false} href="/aide/contact?rubrique=securite-confidentialite" className="underline">centre d&apos;aide</Link>.{policy && <> Politique de confidentialité en vigueur : version {policy}.</>}</p>
          </section>

          <Section id="engagements" letter="A" title="Nos engagements">
            <ul className="grid gap-3 sm:grid-cols-2">{commitments.map(({ Icon, t, d }) => (
              <li key={t} className="flex gap-3 rounded-2xl border bg-white p-4"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#EAF6EE] text-[#068132]"><Icon className="size-5" aria-hidden /></span>
                <span><span className="block font-bold text-[#052D1E]">{t}</span><span className="text-sm text-muted-foreground">{d}</span></span></li>))}</ul>
          </Section>

          <Section id="utilisation" letter="B" title="Comment utilisons-nous vos données ?">
            <p className="text-muted-foreground">Pour chaque service : les informations nécessaires, à quoi elles servent, qui les reçoit et combien de temps elles sont conservées.</p>
            <p className="rounded-xl bg-[#EAF6EE] p-3 text-sm"><strong>Obligatoire ou facultatif ?</strong> Seules les informations nécessaires au service demandé sont obligatoires (par exemple votre nom et un moyen de contact pour un rendez-vous) ; sans elles, ce service ne peut pas être rendu. Tout le reste est facultatif : refuser un consentement facultatif ne vous empêche pas d&apos;utiliser SantéProxi.</p>
            <div className="space-y-2">{uses.map(([s, data, why, who, keep]) => (
              <details key={s} className="group rounded-2xl border bg-white p-4 open:shadow-sm">
                <summary className="cursor-pointer list-none font-bold text-[#052D1E]"><span className="me-2 text-[#068132] group-open:hidden">+</span><span className="me-2 hidden text-[#068132] group-open:inline">−</span>{s}</summary>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[11rem_1fr]">
                  <dt className="font-semibold">Informations</dt><dd>{data}</dd>
                  <dt className="font-semibold">Finalité</dt><dd>{why}</dd>
                  <dt className="font-semibold">Destinataires</dt><dd>{who}</dd>
                  <dt className="font-semibold">Conservation</dt><dd>{keep}</dd>
                </dl>
              </details>))}</div>
          </Section>

          <Section id="protection" letter="C" title="Comment protégeons-nous vos données ?">
            <p className="text-muted-foreground">Nous ne présentons ici que les mesures réellement en place, et nous indiquons celles qui sont encore en cours.</p>
            <ul className="grid gap-3 sm:grid-cols-2">{protections.map(([t, d, done]) => (
              <li key={t} className="rounded-2xl border bg-white p-4">
                <p className="flex items-center gap-2 font-bold text-[#052D1E]">{done ? <CheckCircle2 className="size-5 text-[#068132]" aria-hidden /> : <ServerCog className="size-5 text-amber-600" aria-hidden />}{t}
                  <span className={`ms-auto rounded-full px-2 py-0.5 text-xs font-semibold ${done ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>{done ? "En place" : "En cours"}</span></p>
                <p className="mt-1 text-sm text-muted-foreground">{d}</p>
              </li>))}</ul>
          </Section>

          <Section id="droits" letter="D" title="Vos droits et vos choix">
            <div className="grid gap-3 sm:grid-cols-2">
              {[["Consulter et exporter", "Téléchargez à tout moment une copie de vos données depuis votre centre de confidentialité."],
                ["Rectifier", "Modifiez vos informations dans Mon compte, ou demandez une correction."],
                ["Retirer un consentement", "Chaque consentement se retire en un geste. Le retrait ne supprime pas automatiquement les données déjà enregistrées : vous pouvez les supprimer séparément."],
                ["Demander la suppression", "Supprimez votre compte, ou adressez une demande de suppression à l'équipe."],
                ["Vous opposer", "Opposez-vous à un traitement qui ne repose pas sur une obligation : l'équipe examine votre demande."],
                ["Être informé(e)", "Consultez l'historique des actions sensibles sur votre compte."]].map(([t, d]) => (
                <div key={t} className="rounded-2xl border bg-white p-4"><p className="font-bold text-[#052D1E]">{t}</p><p className="text-sm text-muted-foreground">{d}</p></div>))}
            </div>
            <p className="text-sm">Ces droits s&apos;exercent depuis <Link prefetch={false} href="/compte/confidentialite" className="font-semibold text-[#068132] underline">Mes données et confidentialité</Link>, ou par la <Link prefetch={false} href="/infos/contact?sujet=donnees" className="font-semibold text-[#068132] underline">page Contact</Link> si vous n&apos;avez pas de compte. Au Mali, vous pouvez aussi saisir l&apos;Autorité de protection des données à caractère personnel (APDP).</p>
          </Section>

          <Section id="prestataires" letter="E" title="Nos prestataires technologiques">
            <p className="text-muted-foreground">SantéProxi s&apos;appuie sur des prestataires techniques. Ils agissent pour notre compte et n&apos;utilisent pas vos données pour leurs propres besoins selon leurs conditions contractuelles.</p>
            <ul className="space-y-2">{(recipients.length ? recipients.map((x) => [x.name, `${x.role}. Pays : ${x.country}`, x.data_categories] as [string, string, string]) : providers).map(([n, r, d]) => (
              <li key={n} className="rounded-2xl border bg-white p-4 text-sm"><p className="flex items-center gap-2 font-bold text-[#052D1E]"><Building2 className="size-4 text-[#1D5FA8]" aria-hidden />{n}</p>
                <p><span className="font-semibold">Rôle :</span> {r}</p><p><span className="font-semibold">Données concernées :</span> {d}</p></li>))}</ul>
            <p className="text-sm text-muted-foreground">Les données sont aujourd&apos;hui hébergées dans l&apos;Union européenne. Les démarches relatives au transfert de données hors du Mali auprès de l&apos;APDP sont en cours de préparation.</p>
          </Section>

          <Section id="ia" letter="F" title="IA et innovation">
            <div className="rounded-2xl border bg-white p-4 text-sm">
              <p className="flex items-center gap-2 font-bold text-[#052D1E]"><Bot className="size-5 text-[#068132]" aria-hidden /> L&apos;assistant santé</p>
              <ul className="mt-2 list-disc space-y-1 ps-5">
                <li>Quand vous posez une question à l&apos;assistant, le texte de la question est envoyé au fournisseur d&apos;IA (Anthropic) pour produire la réponse. Votre nom et votre identifiant de compte ne sont pas transmis.</li>
                <li>N&apos;y saisissez pas d&apos;informations permettant de vous identifier.</li>
                <li>L&apos;assistant ne pose aucun diagnostic et oriente vers un professionnel ou les secours quand c&apos;est nécessaire.</li>
                <li>SantéProxi n&apos;utilise aucune donnée médicale identifiable pour entraîner un modèle d&apos;IA.</li>
                <li>Votre dossier santé, vos documents et l&apos;espace Femme ne sont jamais envoyés à un service d&apos;IA.</li>
              </ul>
            </div>
          </Section>

          <Section id="conformite" letter="G" title="Conformité et transparence">
            <p className="text-muted-foreground">Nous ne publions ici que des éléments vérifiés.</p>
            <ul className="space-y-2 text-sm">
              <li className="rounded-2xl border bg-white p-4"><strong>Cadre de référence :</strong> loi n° 2013-015 du 21 mai 2013 relative à la protection des données à caractère personnel en République du Mali.</li>
              <li className="rounded-2xl border bg-white p-4"><strong>Formalités auprès de l&apos;APDP :</strong> en préparation. Aucune déclaration ni autorisation n&apos;a encore été délivrée.</li>
              <li className="rounded-2xl border bg-white p-4"><strong>Audits et certifications :</strong> aucun audit externe ni certification à ce jour. Les contrôles automatisés de sécurité de la plateforme sont exécutés à chaque version.</li>
              <li className="rounded-2xl border bg-white p-4"><strong>Validation juridique :</strong> nos textes de confidentialité sont en cours de validation par un juriste.</li>
            </ul>
          </Section>

          <p className="text-xs text-muted-foreground">Dernière mise à jour : {UPDATED}. Cette page décrit le fonctionnement actuel de SantéProxi ; elle évoluera avec le service.</p>
        </div>
      </div>
    </div>
  );
}
