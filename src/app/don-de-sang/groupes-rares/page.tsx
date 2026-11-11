import Link from "next/link";
import { Dna, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input } from "@/components/ui/input";
import { BloodNav } from "@/components/blood/blood-nav";
import { joinRareRegistry, setRareAvailability, withdrawRareRegistry } from "@/app/actions/donor";

export const metadata = { title: "Registre des groupes sanguins rares", description: "Inscription volontaire des donneurs aux groupes sanguins ou phénotypes particuliers, validée par un centre habilité." };
export const dynamic = "force-dynamic";

type Reg = { phenotype_note: string | null; availability: string; status: string; rare_criteria: string | null; verified_center: string | null; verified_at: string | null; decision_note: string | null; consent_at: string };
const ST: Record<string, [string, string]> = { en_attente: ["En attente de vérification par un centre habilité", "bg-amber-100 text-amber-900"], verifie: ["Vérifiée", "bg-emerald-100 text-emerald-900"], refuse: ["Non retenue", "bg-slate-200 text-slate-800"] };

export default async function RareRegistry() {
  const session = await getSession();
  const supabase = await createClient();
  const [validator, donor, reg] = session ? await Promise.all([
    supabase.rpc("is_blood_validator").then((r) => !!r.data),
    supabase.from("blood_donor_profiles").select("blood_group, blood_group_verified").eq("user_id", session.userId).maybeSingle().then((r) => r.data as { blood_group: string | null; blood_group_verified: boolean } | null),
    supabase.from("blood_rare_registry").select("phenotype_note, availability, status, rare_criteria, verified_center, verified_at, decision_note, consent_at").eq("user_id", session.userId).maybeSingle().then((r) => r.data as Reg | null),
  ]) : [false, null, null];
  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <BloodNav current="/don-de-sang/groupes-rares" validator={validator} />
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><Dna className="size-7 text-red-600" aria-hidden /> Registre des groupes sanguins rares</h1>
        <p className="text-muted-foreground">Certaines personnes ont un groupe sanguin ou un phénotype peu fréquent. Quand un patient compatible a besoin de sang, le centre de transfusion doit pouvoir retrouver rapidement des donneurs volontaires. Ce registre est entièrement volontaire.</p>
      </header>
      <section className="space-y-1 rounded-2xl bg-brand-mint p-4 text-sm text-brand-deep">
        <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4" aria-hidden /> Confidentialité</p>
        <ul className="list-disc space-y-0.5 ps-5">
          <li>Aucune information du registre n&apos;est publique. Seuls les membres habilités du CNTS et l&apos;administration peuvent y chercher, et chaque recherche est enregistrée.</li>
          <li>SantéProxi ne qualifie jamais un groupe de « rare » automatiquement : c&apos;est le centre qui vérifie votre groupe et indique le critère retenu par les spécialistes.</li>
          <li>Vous pouvez indiquer que vous n&apos;êtes pas disponible, ou quitter le registre à tout moment.</li>
        </ul>
      </section>
      <section className="space-y-3 rounded-2xl border bg-white p-4">
        {!session ? <p className="text-sm"><Link prefetch={false} href="/connexion?suite=%2Fdon-de-sang%2Fgroupes-rares" className="font-semibold text-primary underline">Connectez-vous</Link> pour vous inscrire.</p>
        : !donor ? <p className="text-sm">Créez d&apos;abord votre <Link prefetch={false} href="/don-de-sang/mon-espace" className="font-semibold text-primary underline">espace donneur</Link>.</p>
        : reg ? (
          <div className="space-y-3 text-sm">
            <p><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ST[reg.status][1]}`}>{ST[reg.status][0]}</span></p>
            <dl className="grid gap-1">
              <div><dt className="inline text-muted-foreground">Groupe ABO/Rh : </dt><dd className="inline font-semibold">{donor.blood_group ? `${donor.blood_group}${donor.blood_group_verified ? " (confirmé par un centre)" : " (déclaré)"}` : "non renseigné"}</dd></div>
              <div><dt className="inline text-muted-foreground">Phénotype documenté : </dt><dd className="inline">{reg.phenotype_note ?? "—"}</dd></div>
              {reg.status === "verifie" && <><div><dt className="inline text-muted-foreground">Critère retenu : </dt><dd className="inline">{reg.rare_criteria}</dd></div>
                <div><dt className="inline text-muted-foreground">Vérifié par : </dt><dd className="inline">{reg.verified_center}, le {formatDate(reg.verified_at!)}</dd></div></>}
              {reg.decision_note && <div><dt className="inline text-muted-foreground">Note du centre : </dt><dd className="inline">{reg.decision_note}</dd></div>}
              <div><dt className="inline text-muted-foreground">Accord donné le : </dt><dd className="inline">{formatDate(reg.consent_at)}</dd></div>
            </dl>
            <div className="flex flex-wrap gap-2">
              <ActionForm action={setRareAvailability}><input type="hidden" name="available" value={reg.availability === "disponible" ? "0" : "1"} />
                <SubmitButton size="sm" variant="outline">{reg.availability === "disponible" ? "Je ne suis pas disponible pour le moment" : "Je suis de nouveau disponible"}</SubmitButton></ActionForm>
              <ActionForm action={withdrawRareRegistry}><SubmitButton size="sm" variant="ghost" confirm="Quitter le registre ? Vos informations de registre seront supprimées.">Quitter le registre</SubmitButton></ActionForm>
            </div>
            <p className="text-xs">Disponibilité actuelle : <strong>{reg.availability === "disponible" ? "disponible" : "indisponible"}</strong></p>
          </div>
        ) : (
          <ActionForm action={joinRareRegistry} className="space-y-3">
            <p className="text-sm">Inscrivez-vous si un centre de transfusion ou un laboratoire vous a indiqué que votre groupe sanguin ou votre phénotype est particulier.</p>
            <Field label="Ce qu'on vous a indiqué (facultatif)" htmlFor="ph" hint="ex. phénotype noté sur votre carte de groupe sanguin. Le centre le vérifiera."><Input id="ph" name="phenotype_note" maxLength={300} /></Field>
            <label className="flex items-start gap-2 rounded-xl bg-muted/50 p-3 text-sm"><input type="checkbox" name="consent" required className="mt-1 size-4" />
              <span>J&apos;accepte que mon nom, mon numéro de téléphone, mon groupe et ma région soient visibles par les membres habilités du CNTS, afin d&apos;être contacté en cas de besoin. Je peux retirer mon accord à tout moment.</span></label>
            <SubmitButton>Rejoindre le registre</SubmitButton>
          </ActionForm>
        )}
      </section>
    </div>
  );
}
