import { cn } from "@/lib/utils";

/**
 * Nature de chaque indicateur de SantéProxi Data. Les chiffres ne sont jamais présentés comme
 * des statistiques officielles du système de santé sans validation.
 */
export type DataKind = "administratif" | "declare" | "mesure" | "estimation";
export const DATA_KINDS: Record<DataKind, { label: string; tone: string; text: string }> = {
  administratif: { label: "Administratif", tone: "bg-emerald-100 text-emerald-900", text: "Vérifié par l'équipe SantéProxi à partir de justificatifs ou de registres officiels (Ordres, tableau des pharmacies…)." },
  declare: { label: "Déclaré", tone: "bg-blue-100 text-blue-900", text: "Saisi par les établissements eux-mêmes (stocks, prix, gardes, services) : non vérifié une à une." },
  mesure: { label: "Mesuré sur SantéProxi", tone: "bg-violet-100 text-violet-900", text: "Usage réel de la plateforme (recherches, questions, inscriptions volontaires), surtout par des utilisateurs de smartphone." },
  estimation: { label: "Estimation", tone: "bg-amber-100 text-amber-900", text: "Signal calculé à partir des chiffres précédents (taux d'échec, couverture) : à vérifier sur le terrain." },
};

export function DataBadge({ kind }: { kind: DataKind }) {
  const d = DATA_KINDS[kind];
  return <span title={d.text} className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", d.tone)}>{d.label}</span>;
}

export function DataLegend() {
  return (
    <details className="rounded-2xl border bg-white p-3 text-sm">
      <summary className="cursor-pointer font-semibold text-brand-deep">D&apos;où viennent les chiffres ? Légende des étiquettes</summary>
      <ul className="mt-2 space-y-1.5">{(Object.keys(DATA_KINDS) as DataKind[]).map((k) => <li key={k} className="flex flex-wrap items-start gap-2"><DataBadge kind={k} /><span className="text-muted-foreground">{DATA_KINDS[k].text}</span></li>)}</ul>
      <p className="mt-2 text-xs text-muted-foreground">Aucun de ces chiffres n&apos;est une statistique officielle du système national d&apos;information sanitaire tant qu&apos;il n&apos;a pas été validé par l&apos;institution concernée.</p>
    </details>
  );
}
