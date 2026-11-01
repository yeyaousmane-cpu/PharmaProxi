import Link from "next/link";
import { BookOpen, Briefcase, Building2, CircleAlert, HandHeart, HeartPulse, Pill, ShieldPlus, UserRound, Users } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { formatXof } from "@/lib/format";
import { GUIDE_CHECKED, SOURCES, VOLUNTARY_CLASSES, VOLUNTARY_RATES, voluntaryContribution } from "@/lib/amo-guide";

export const metadata = {
  title: "AMO et INPS : le guide complet",
  description: "Assurance maladie obligatoire au Mali : qui est couvert, cotisations, remboursements, inscription à l'INPS, assurance volontaire pour les non-salariés, RAMED.",
};

const TOC = [
  ["bases", "L'AMO en bref"],
  ["qui", "Qui est couvert ?"],
  ["famille", "Votre famille (ayants droit)"],
  ["cout", "Combien ça coûte ?"],
  ["droits", "Quand les droits s'ouvrent"],
  ["remboursement", "Ce qui est remboursé"],
  ["salarie", "Je suis salarié : m'inscrire à l'INPS"],
  ["employeur", "Je suis employeur"],
  ["volontaire", "Je ne suis pas salarié : l'assurance volontaire"],
  ["autres", "Autres solutions : mutuelles, RAMED"],
  ["pharmacie", "À la pharmacie"],
  ["sources", "Sources"],
] as const;

function H2({ id, icon: Icon, children }: { id: string; icon: typeof BookOpen; children: React.ReactNode }) {
  return <h2 id={id} className="flex scroll-mt-24 items-center gap-2 text-xl font-bold text-brand-deep"><Icon className="size-5 shrink-0 text-primary" aria-hidden />{children}</h2>;
}
const Box = ({ children }: { children: React.ReactNode }) => <section className="space-y-3 rounded-2xl border bg-white p-5 text-[15px] leading-relaxed">{children}</section>;

export default function AmoGuide() {
  const total = VOLUNTARY_RATES.amo + VOLUNTARY_RATES.famille + VOLUNTARY_RATES.vieillesse;
  return (
    <div className="container-page space-y-6 py-6">
      <header className="space-y-2">
        <p className="text-sm"><Link prefetch={false} href="/amo" className="text-primary underline">AMO : médicaments pris en charge</Link> › Guide</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><BookOpen className="size-7 text-primary" aria-hidden /> AMO et INPS : tout ce qu&apos;il faut savoir</h1>
        <p className="max-w-3xl text-muted-foreground">
          Qui a droit à l&apos;Assurance maladie obligatoire au Mali, combien elle coûte, ce qu&apos;elle rembourse, comment s&apos;inscrire à l&apos;INPS,
          et comment se couvrir quand on n&apos;est pas salarié (commerçant, artisan, profession libérale, indépendant).
        </p>
      </header>

      <Alert tone="info" title={`Informations vérifiées en ${GUIDE_CHECKED}`}>
        Les règles et les taux peuvent évoluer. Pour votre situation précise, adressez-vous au centre INPS de votre commune, à la CMSS (fonctionnaires) ou à la CANAM.
      </Alert>

      <nav aria-label="Sommaire" className="rounded-2xl border bg-brand-mint p-4">
        <p className="mb-2 font-semibold text-brand-deep">Sommaire</p>
        <ol className="grid gap-1 text-sm sm:grid-cols-2">
          {TOC.map(([id, l], i) => <li key={id}><a href={`#${id}`} className="hover:underline">{i + 1}. {l}</a></li>)}
        </ol>
      </nav>

      <Box>
        <H2 id="bases" icon={ShieldPlus}>L&apos;AMO en bref</H2>
        <p>L&apos;Assurance maladie obligatoire (AMO) a été créée par la <strong>loi n° 09-015 du 26 juin 2009</strong>. Elle paie une grande partie de vos frais de santé (consultations, analyses, médicaments, hospitalisation, maternité) en échange d&apos;une cotisation prélevée sur le salaire ou la pension.</p>
        <p>Elle est pilotée par la <strong>CANAM</strong> (Caisse nationale d&apos;assurance maladie), qui confie une partie du travail (inscription, encaissement des cotisations, paiement des soins) à des organismes gestionnaires délégués :</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>INPS</strong> : salariés du privé, non-salariés en assurance volontaire et retraités du privé ;</li>
          <li><strong>CMSS</strong> (Caisse malienne de sécurité sociale) : agents de l&apos;État et retraités du public ;</li>
          <li><strong>ANAM</strong> : RAMED, la prise en charge gratuite des personnes démunies ;</li>
          <li><strong>UTM</strong> (Union technique de la mutualité) : mutuelles de santé du secteur informel et du monde rural.</li>
        </ul>
        <p>Ensemble, ces dispositifs forment le Régime d&apos;assurance maladie universelle (RAMU), qui vise à couvrir toute la population.</p>
      </Box>

      <Box>
        <H2 id="qui" icon={Users}>Qui est couvert ?</H2>
        <ul className="list-disc space-y-1 pl-5">
          <li>les <strong>salariés du secteur privé</strong> (via leur employeur, à l&apos;INPS) ;</li>
          <li>les <strong>agents de l&apos;État</strong> et du secteur public (CMSS) ;</li>
          <li>les <strong>retraités</strong> qui touchent une pension publique ou privée ;</li>
          <li>les <strong>non-salariés inscrits à l&apos;assurance volontaire</strong> de l&apos;INPS : commerçants, artisans, professions libérales, industriels, travailleurs indépendants (voir <a href="#volontaire" className="text-primary underline">section 9</a>).</li>
        </ul>
        <p>L&apos;extension de l&apos;AMO aux travailleurs agricoles, au secteur informel et aux étudiants est prévue ; en attendant, ces personnes peuvent passer par une mutuelle de santé (<a href="#autres" className="text-primary underline">section 10</a>).</p>
      </Box>

      <Box>
        <H2 id="famille" icon={HeartPulse}>Votre famille (ayants droit)</H2>
        <p>Une seule cotisation couvre aussi, sans payer plus :</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>le <strong>conjoint légalement marié</strong> (acte de mariage demandé) ;</li>
          <li>les <strong>enfants de moins de 14 ans</strong>, et jusqu&apos;à <strong>21 ans</strong> s&apos;ils sont scolarisés ;</li>
          <li>les <strong>enfants handicapés</strong> qui ne peuvent pas travailler, sans limite d&apos;âge ;</li>
          <li>les <strong>parents directs</strong> (père, mère) qui dépendent financièrement de l&apos;assuré.</li>
        </ul>
        <p>Pensez à déclarer chaque membre de la famille lors de l&apos;inscription (ou à chaque mariage, naissance) : sans déclaration, pas de prise en charge.</p>
      </Box>

      <Box>
        <H2 id="cout" icon={Briefcase}>Combien ça coûte ?</H2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead><tr className="border-b text-left"><th className="py-2 pr-3">Situation</th><th className="py-2 pr-3">Part de l&apos;assuré</th><th className="py-2">Part de l&apos;employeur</th></tr></thead>
            <tbody className="divide-y">
              <tr><td className="py-2 pr-3">Salarié du privé</td><td className="py-2 pr-3"><strong>3,06 %</strong> du salaire</td><td className="py-2">3,5 % du salaire</td></tr>
              <tr><td className="py-2 pr-3">Retraité</td><td className="py-2 pr-3"><strong>0,75 %</strong> de la pension</td><td className="py-2">—</td></tr>
              <tr><td className="py-2 pr-3">Assuré volontaire (non-salarié)</td><td className="py-2 pr-3"><strong>6,56 %</strong> du revenu de sa classe</td><td className="py-2">— (il paie seul)</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted-foreground">Pour un salarié, la cotisation est retenue directement sur le bulletin de paie : il n&apos;a aucune démarche de paiement. Exemple : salaire de 150 000 FCFA → environ {formatXof(Math.round(150_000 * 0.0306))} par mois pour le salarié. Les fonctionnaires cotisent aussi sur leur salaire, via la CMSS.</p>
      </Box>

      <Box>
        <H2 id="droits" icon={CircleAlert}>Quand les droits s&apos;ouvrent</H2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Il faut <strong>6 mois de cotisations consécutifs</strong> avant de bénéficier des remboursements.</li>
          <li>Si vous perdez votre emploi, vos droits sont <strong>maintenus 6 mois</strong> au maximum.</li>
          <li>Au décès de l&apos;assuré, la famille reste couverte <strong>1 an</strong> (si elle ne touche pas de pension de survivant).</li>
        </ul>
      </Box>

      <Box>
        <H2 id="remboursement" icon={HandHeart}>Ce qui est remboursé</H2>
        <div className="grid gap-3 sm:grid-cols-3">
          {[["70 %", "Soins ambulatoires", "consultations, analyses, radios"], ["70 %", "Médicaments de la liste AMO", "en pharmacie conventionnée"], ["80 %", "Hospitalisation", ""]].map(([p, t, d]) => (
            <div key={t} className="rounded-xl bg-brand-mint p-4"><p className="text-2xl font-bold text-brand-deep">{p}</p><p className="font-semibold">{t}</p>{d && <p className="text-sm text-muted-foreground">{d}</p>}</div>
          ))}
        </div>
        <p>Le reste (30 % ou 20 %), appelé <strong>ticket modérateur</strong>, est à votre charge. Le remboursement se calcule sur le <strong>tarif de référence</strong> : si le prix est plus élevé, la différence est aussi pour vous.</p>
        <p><strong>Grossesse</strong> : déclarez-la <strong>au cours du 3e mois</strong>. La prise en charge court de la déclaration jusqu&apos;à 8 semaines après l&apos;accouchement.</p>
        <p>Chez un prestataire conventionné (hôpital, clinique, pharmacie), c&apos;est le <strong>tiers payant</strong> : vous ne payez que votre part, la caisse règle le reste directement.</p>
      </Box>

      <Box>
        <H2 id="salarie" icon={UserRound}>Je suis salarié : m&apos;inscrire à l&apos;INPS</H2>
        <p>C&apos;est votre <strong>employeur</strong> qui doit vous déclarer à l&apos;INPS dès l&apos;embauche (bulletin d&apos;embauche). Vous recevez un numéro d&apos;immatriculation définitif à 11 chiffres. Pour obtenir la <strong>carte d&apos;assuré social</strong> :</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>L&apos;employeur remplit et cachète la <strong>demande d&apos;immatriculation</strong>.</li>
          <li>Vous la déposez au <strong>centre INPS de votre commune</strong> avec les pièces ci-dessous.</li>
          <li>On vous remet un récépissé avec une date de rendez-vous.</li>
          <li>Le jour venu, vous revenez avec le récépissé original, pour la photo et le retrait de la carte.</li>
        </ol>
        <div className="rounded-xl border p-4">
          <p className="font-semibold">Pièces à fournir (originaux)</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            <li>extrait d&apos;acte de naissance du salarié ;</li>
            <li>demande d&apos;immatriculation remplie et cachetée par l&apos;employeur ;</li>
            <li>si vous êtes marié(e) : acte de naissance du conjoint et acte de mariage ;</li>
            <li>si vous avez des enfants : leurs actes de naissance.</li>
          </ul>
          <p className="mt-2 text-sm"><strong>Coût :</strong> gratuit. <strong>Délai :</strong> 21 jours au plus après le dépôt.</p>
        </div>
        <p className="text-sm text-muted-foreground">Votre employeur ne vous a pas déclaré ? Vous n&apos;êtes alors pas couvert, même si vous travaillez. Demandez-lui votre numéro INPS, ou renseignez-vous au centre INPS de votre commune.</p>
      </Box>

      <Box>
        <H2 id="employeur" icon={Building2}>Je suis employeur</H2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Demandez votre <strong>immatriculation à l&apos;INPS dès l&apos;ouverture de l&apos;activité</strong> (formulaire à retirer dans une représentation de l&apos;INPS : raison sociale, statut, adresse, activité, effectif, premiers salaires, date de début, nom du dirigeant).</li>
          <li>Joignez <strong>un</strong> justificatif : statuts, décision de création, autorisation d&apos;exercer, récépissé, contrats, NIF ou registre du commerce.</li>
          <li>Joignez un <strong>bulletin d&apos;embauche</strong> pour chaque travailleur.</li>
          <li>Vous recevez un numéro employeur et vos taux de cotisation ; déclarez ensuite chaque nouvelle embauche.</li>
        </ol>
        <p className="text-sm text-muted-foreground">Cotisations sur le salaire total : 3,5 % (AMO) + 8 % (prestations familiales) + 5,4 % (vieillesse, invalidité, décès) + 1 à 4 % (accidents du travail) + 1 % (taxe ANPE) côté employeur ; 3,06 % (AMO) + 3,6 % (vieillesse) retenus au salarié.</p>
      </Box>

      <Box>
        <H2 id="volontaire" icon={HandHeart}>Je ne suis pas salarié : l&apos;assurance volontaire de l&apos;INPS</H2>
        <p>Vous êtes <strong>commerçant, artisan, profession libérale (avocat, médecin privé, consultant…), industriel ou travailleur indépendant</strong> ? Vous pouvez vous assurer vous-même à l&apos;INPS (assurance volontaire, loi n° 99-047 du 28 décembre 1999) et bénéficier, pour vous et votre famille :</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>de l&apos;<strong>AMO</strong> (mêmes remboursements que les salariés) ;</li>
          <li>des <strong>prestations familiales</strong> ;</li>
          <li>d&apos;une <strong>retraite</strong> et d&apos;une couverture invalidité/décès.</li>
        </ul>
        <p>Les accidents du travail ne sont couverts que pour les salariés.</p>

        <h3 className="pt-2 font-bold">Combien je paie ?</h3>
        <p>Vous choisissez une classe selon vos revenus du trimestre ; la cotisation est calculée sur le revenu de référence de la classe et se paie <strong>chaque trimestre</strong>.</p>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {VOLUNTARY_CLASSES.map((c) => (
            <li key={c.cls} className="rounded-xl border p-3 text-sm">
              <p className="font-bold text-brand-deep">Classe {c.cls}</p>
              <p className="text-muted-foreground">Revenus : {c.income} FCFA par trimestre · calcul sur {formatXof(c.base)}</p>
              <p className="mt-2 flex justify-between gap-2"><span>AMO seule ({String(VOLUNTARY_RATES.amo).replace(".", ",")} %)</span><strong className="whitespace-nowrap text-brand-deep">≈ {formatXof(voluntaryContribution(c.base, VOLUNTARY_RATES.amo))}</strong></p>
              <p className="flex justify-between gap-2"><span>AMO + famille + retraite ({String(total).replace(".", ",")} %)</span><strong className="whitespace-nowrap">≈ {formatXof(voluntaryContribution(c.base, total))}</strong></p>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">Montants par trimestre, calculés à partir des taux en vigueur au 1er janvier 2025 (AMO 6,56 %, prestations familiales 8 %, vieillesse-invalidité-décès 9 %). Exemple : un commerçant de la classe 1 paie environ {formatXof(voluntaryContribution(125_000, VOLUNTARY_RATES.amo))} par trimestre pour l&apos;AMO, soit à peu près {formatXof(Math.round(voluntaryContribution(125_000, VOLUNTARY_RATES.amo) / 3))} par mois. Faites confirmer le montant par l&apos;INPS lors de l&apos;adhésion.</p>

        <h3 className="pt-2 font-bold">Les conditions à connaître</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>L&apos;assurance commence le <strong>1er jour du trimestre</strong> au cours duquel l&apos;INPS reçoit votre demande.</li>
          <li><strong>AMO</strong> : remboursements après <strong>6 mois de cotisations consécutifs</strong>.</li>
          <li><strong>Prestations familiales</strong> : après 2 trimestres consécutifs d&apos;affiliation.</li>
          <li><strong>Retraite à taux plein</strong> : 60 ans et 15 ans d&apos;assurance. <strong>Invalidité</strong> : 10 ans d&apos;assurance.</li>
          <li>Payez sans interruption : un arrêt des paiements fait perdre la continuité des droits.</li>
        </ul>

        <h3 className="pt-2 font-bold">Comment adhérer ?</h3>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Rendez-vous au <strong>centre INPS de votre commune</strong> (ou à la direction régionale) et demandez le formulaire d&apos;<strong>assurance volontaire</strong> ; il est aussi téléchargeable sur <a href="https://inps.site/ova_doc/assurance-volontaire-2/" target="_blank" rel="noopener noreferrer" className="text-primary underline">le site de l&apos;INPS</a>.</li>
          <li>Apportez vos pièces d&apos;état civil (acte de naissance, et ceux du conjoint et des enfants à couvrir, acte de mariage) et un justificatif de votre activité : l&apos;INPS vous indiquera la liste exacte.</li>
          <li>Choisissez votre classe de revenus, puis payez la première cotisation trimestrielle.</li>
        </ol>
      </Box>

      <Box>
        <H2 id="autres" icon={Users}>Autres solutions : mutuelles de santé et RAMED</H2>
        <p><strong>Mutuelles de santé</strong> : pour le secteur informel et le monde rural (cultivateurs, petits commerces, artisans regroupés…), l&apos;adhésion à une mutuelle de santé de votre commune ou de votre profession permet d&apos;être pris en charge dans le cadre du RAMU, avec l&apos;UTM. Renseignez-vous auprès de la mairie ou du centre de santé communautaire (CSCom).</p>
        <p><strong>RAMED</strong> (Régime d&apos;assistance médicale), pour les personnes <strong>sans ressources</strong> qui n&apos;ont aucune autre assurance :</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>gratuit (aucune cotisation), géré par l&apos;<strong>ANAM</strong> ;</li>
          <li>il faut être reconnu indigent (certificat délivré par la <strong>mairie</strong>), puis s&apos;inscrire auprès de l&apos;ANAM ;</li>
          <li>couvre aussi le conjoint et les enfants (moins de 14 ans, jusqu&apos;à 21 ans s&apos;ils étudient, enfants handicapés) ;</li>
          <li>prise en charge à <strong>100 %</strong> dans les établissements publics et communautaires conventionnés : consultations, hospitalisation, médicaments de la liste, maternité ;</li>
          <li>carte valable <strong>3 ans</strong> partout au Mali.</li>
        </ul>
      </Box>

      <Box>
        <H2 id="pharmacie" icon={Pill}>À la pharmacie</H2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Présentez votre <strong>carte AMO</strong> en cours de validité et une <strong>ordonnance</strong>.</li>
          <li>Allez dans une <strong>pharmacie conventionnée</strong> : vous ne payez que votre part, environ 30 % du tarif de référence. <Link prefetch={false} href="/amo#ph-t" className="text-primary underline">Voir les pharmacies conventionnées</Link>.</li>
          <li>Seuls les médicaments de la <Link prefetch={false} href="/amo" className="text-primary underline">liste AMO</Link> sont pris en charge. Si le vôtre n&apos;y est pas, demandez au pharmacien s&apos;il existe un équivalent (générique) qui l&apos;est.</li>
          <li>Une délivrance couvre au plus <strong>un mois de traitement</strong> (45 jours pour certains protocoles), selon la convention CANAM–officines.</li>
        </ul>
      </Box>

      <Box>
        <H2 id="sources" icon={BookOpen}>Sources</H2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {SOURCES.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{s.label}</a></li>)}
          <li>Liste CANAM des médicaments pris en charge (octobre 2014), article 21 de la convention CANAM–officines.</li>
        </ul>
        <p className="text-sm"><Link prefetch={false} href="/droits" className="font-semibold text-primary underline">Voir aussi : congé de maternité, allocations familiales, retraite, accident du travail…</Link></p>
        <p className="text-xs text-muted-foreground">PharmaProxi n&apos;est ni la CANAM ni l&apos;INPS. Ce guide résume les règles publiées ; seuls ces organismes peuvent confirmer vos droits.</p>
      </Box>
    </div>
  );
}
