import Link from "next/link";
import { Baby, FlaskConical, Hospital, Moon, Stethoscope, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { F } from "./ui";

export const fmt = (d: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" }) =>
  d ? new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", ...opts }).format(new Date(`${d}T00:00:00Z`)) : "—";

/** Accès à l'annuaire général : spécialistes, sages-femmes, maternités, laboratoires, gardes. */
export async function FindCare({ title = "Trouver un professionnel" }: { title?: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("medical_specialties").select("id, code").in("code", ["gynecologie", "endocrinologie"]);
  const id = (c: string) => (data ?? []).find((s) => s.code === c)?.id as string | undefined;
  const links: [string, string, typeof Stethoscope][] = [
    [id("gynecologie") ? `/medecins?specialite=${id("gynecologie")}` : "/medecins?q=gyn%C3%A9cologue", "Gynécologue-obstétricien", Stethoscope],
    ["/medecins?q=sage-femme", "Sage-femme", Baby],
    ["/medecins?q=g%C3%A9n%C3%A9raliste", "Médecin généraliste", UserRound],
    [id("endocrinologie") ? `/medecins?specialite=${id("endocrinologie")}` : "/medecins?q=endocrinologue", "Endocrinologue", Stethoscope],
    ["/cliniques", "Maternités, cliniques, hôpitaux", Hospital],
    ["/laboratoires", "Laboratoires d'analyses", FlaskConical],
    ["/garde", "Pharmacies de garde", Moon],
  ];
  return (
    <section className={`${F.card} space-y-3`}>
      <h2 className={F.h2}>{title}</h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {links.map(([href, label, Icon]) => (
          <li key={href}><Link prefetch={false} href={href} className="flex items-center gap-2 rounded-xl border border-[#D96A91]/20 px-3 py-2.5 text-sm font-semibold hover:bg-[#F8E7EF]"><Icon className="size-4 shrink-0 text-[#D96A91]" aria-hidden />{label}</Link></li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">La prise de rendez-vous en ligne est possible uniquement avec les professionnels qui l&apos;ont activée : <Link prefetch={false} href="/rendez-vous" className="underline">voir les rendez-vous disponibles</Link>.</p>
    </section>
  );
}

export function Estimate() {
  return <p className="text-xs text-muted-foreground">Les dates affichées sont des <strong>estimations</strong> calculées à partir de vos saisies. Elles ne permettent pas d&apos;éviter une grossesse et ne remplacent pas l&apos;avis d&apos;un professionnel.</p>;
}
