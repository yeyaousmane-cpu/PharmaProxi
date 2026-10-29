import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { humanizeError } from "@/lib/errors";
import { cn } from "@/lib/utils";

type Stats = {
  jours: number;
  passe: { total: number; honores: number; absents: number; annules_patient: number; annules_cabinet: number; refuses: number; expires: number; en_ligne: number; par_telephone: number; nouveaux_patients: number };
  a_venir_7j: number; libres_7j: number; vues_fiche: number;
  repere_specialite: { medecins: number; taux_absence: number; taux_annulation: number } | null;
};
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)} %` : "—");

/** Statistiques d'activité : volume, annulations, absences, remplissage, visibilité. */
export async function PracticeStats({ clinicId, basePath, days }: { clinicId?: string; basePath: string; days?: string }) {
  const d = [30, 90, 365].includes(Number(days)) ? Number(days) : 30;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("practice_stats", { p_clinic: clinicId ?? null, p_days: d });
  if (error) return <Alert tone="error" title={humanizeError(error)} />;
  const s = data as Stats;
  const p = s.passe;
  const tenus = p.honores + p.absents;
  const annules = p.annules_patient + p.annules_cabinet;
  const fill = s.a_venir_7j + s.libres_7j;
  const tiles: [string, string, string?][] = [
    ["Rendez-vous sur la période", String(p.total)],
    ["Honorés", String(p.honores)],
    ["Taux d'absence", pct(p.absents, tenus), `${p.absents} patient(s) absent(s)`],
    ["Taux d'annulation", pct(annules, p.total), `${p.annules_patient} par le patient · ${p.annules_cabinet} par le cabinet`],
    ["Pris en ligne", pct(p.en_ligne, p.total), `${p.en_ligne} en ligne · ${p.par_telephone} par téléphone`],
    ["Remplissage des 7 prochains jours", pct(s.a_venir_7j, fill), `${s.a_venir_7j} réservé(s) · ${s.libres_7j} créneau(x) libre(s)`],
    ["Consultations de la fiche", String(s.vues_fiche), "visites de la fiche publique"],
    ["Patients différents (en ligne)", String(p.nouveaux_patients)],
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm">
        {[30, 90, 365].map((x) => (
          <Link prefetch={false} key={x} href={`${basePath}?vue=statistiques&jours=${x}`} className={cn("rounded-md px-3 py-1", x === d ? "bg-muted font-semibold" : "hover:bg-muted")}>
            {x === 365 ? "12 mois" : `${x} jours`}
          </Link>
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, value, hint]) => (
          <li key={label} className="rounded-xl border bg-white p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold text-brand-deep">{value}</p>
            {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
          </li>
        ))}
      </ul>
      {!clinicId && (
        <Card>
          <CardHeader>
            <CardTitle>Repère de votre spécialité</CardTitle>
            <CardDescription>Médiane anonyme des médecins de même spécialité sur PharmaProxi, affichée à partir de 5 médecins comparables.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {s.repere_specialite ? (
              <p>Sur {s.repere_specialite.medecins} médecins : absence médiane <strong>{Math.round(s.repere_specialite.taux_absence * 100)} %</strong>,
                annulation médiane <strong>{Math.round(s.repere_specialite.taux_annulation * 100)} %</strong>.</p>
            ) : <p className="text-muted-foreground">Pas encore assez de médecins comparables pour afficher un repère.</p>}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Pistes pour mieux remplir l&apos;agenda</CardTitle></CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {s.libres_7j > 0 && fill > 0 && s.a_venir_7j / fill < 0.5 && <li>Moins de la moitié des créneaux de la semaine sont réservés : vérifiez que vos horaires et vos motifs correspondent à la demande.</li>}
            {tenus > 0 && p.absents / tenus > 0.1 && <li>Plus de 10 % d&apos;absences : rappelez les consignes et le délai d&apos;annulation dans vos motifs de consultation.</li>}
            {s.libres_7j === 0 && <li>Aucun créneau libre en ligne sur 7 jours : ouvrez la réservation immédiate ou élargissez vos plages.</li>}
            <li>Une fiche complète (présentation, tarifs, moyens de paiement, accès) rassure les patients.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
