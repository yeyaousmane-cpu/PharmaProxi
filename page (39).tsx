import Link from "next/link";
import { BookOpen } from "lucide-react";
import { EmergencyBanner } from "@/components/directory/directory-bits";
import { Alert } from "@/components/ui/alert";
import { getSpecialties, groupByFamily } from "@/lib/directory-server";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Quel spécialiste pour quoi ?" };

/** Guide éducatif statique (ANN-09) : aucune orientation par symptôme, aucun diagnostic. */
export default async function SpecialtiesGuide() {
  const [specialties, settings] = await Promise.all([getSpecialties(), getSettings()]);
  return (
    <div className="container-page max-w-4xl space-y-6 py-6">
      <header>
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-blue"><BookOpen className="size-4" aria-hidden /> Guide</p>
        <h1 className="text-2xl font-bold text-brand-deep sm:text-3xl">Quel spécialiste pour quoi ?</h1>
        <p className="mt-1 text-muted-foreground">Une présentation simple des spécialités médicales, pour savoir à qui s&apos;adresser.</p>
      </header>
      <Alert tone="info" title="En cas de doute, commencez par un médecin généraliste">
        Ce guide n&apos;établit aucun diagnostic et ne remplace pas l&apos;avis d&apos;un professionnel de santé. Le médecin généraliste vous orientera, si besoin, vers le bon spécialiste.
      </Alert>
      <EmergencyBanner numbers={settings.emergency_numbers} />
      {groupByFamily(specialties).map(([family, list]) => (
        <section key={family} aria-labelledby={`f-${list[0].code}`} className="space-y-2">
          <h2 id={`f-${list[0].code}`} className="text-lg font-bold">{family}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {list.map((s) => (
              <li key={s.id} className="rounded-xl border bg-white p-4">
                <p className="font-semibold text-brand-deep">{s.name}</p>
                {s.description && <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>}
                <Link prefetch={false} href={`/medecins?specialite=${s.id}`} className="mt-2 inline-block text-sm font-semibold text-brand-blue underline">Trouver un médecin</Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-xs text-muted-foreground">Descriptions rédigées en termes généraux et soumises à la relecture de l&apos;Ordre des médecins.</p>
    </div>
  );
}
