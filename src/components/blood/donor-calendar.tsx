import { formatDate } from "@/lib/format";

type Mark = { date: string; kind: "valide" | "en_attente" | "prochain" | "collecte"; label: string };
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const DAYS = ["L", "M", "M", "J", "V", "S", "D"];
const STYLE: Record<Mark["kind"], string> = {
  valide: "bg-red-600 text-white font-bold",
  en_attente: "bg-amber-300 text-amber-950 font-bold",
  prochain: "ring-2 ring-red-600 text-red-700 font-bold",
  collecte: "bg-sky-100 text-sky-900 font-semibold underline decoration-sky-600 decoration-2",
};

/** Calendrier sur 12 mois (8 mois passés, le mois en cours, 3 mois à venir) : dons, date indicative, collectes. */
export function DonorCalendar({ marks, today }: { marks: Mark[]; today: string }) {
  const byDay = new Map<string, Mark[]>();
  for (const m of marks) byDay.set(m.date, [...(byDay.get(m.date) ?? []), m]);
  const [ty, tm] = today.split("-").map(Number);
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(ty, tm - 1 - 8 + i, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() }; });
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground sm:hidden">Mois récents et à venir ; tous vos dons figurent dans l&apos;historique.</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Légende">
        <li className="flex items-center gap-1.5"><span className="inline-block size-4 rounded-full bg-red-600" aria-hidden /> Don validé</li>
        <li className="flex items-center gap-1.5"><span className="inline-block size-4 rounded-full bg-amber-300" aria-hidden /> Don en attente</li>
        <li className="flex items-center gap-1.5"><span className="inline-block size-4 rounded-full ring-2 ring-red-600" aria-hidden /> Date indicative de prochain don</li>
        <li className="flex items-center gap-1.5"><span className="inline-block size-4 rounded-full bg-sky-100 ring-1 ring-sky-600" aria-hidden /> Collecte annoncée</li>
      </ul>
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible lg:grid-cols-4">
        {months.map(({ y, m }, idx) => {
          const first = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
          const n = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
          const current = y === ty && m === tm - 1;
          return (
            <div key={`${y}-${m}`} className={`w-[15.5rem] shrink-0 snap-start rounded-xl border bg-white p-2 sm:w-auto ${current ? "border-red-300" : ""} ${idx < 6 ? "hidden sm:block" : ""}`}>
              <p className="mb-1 text-center text-sm font-semibold capitalize text-brand-deep">{MONTHS[m]} {y}</p>
              <div className="grid grid-cols-7 gap-0.5 text-center text-[11px]" role="grid" aria-label={`${MONTHS[m]} ${y}`}>
                {DAYS.map((d, i) => <span key={i} className="text-muted-foreground" aria-hidden>{d}</span>)}
                {Array.from({ length: first }, (_, i) => <span key={`e${i}`} />)}
                {Array.from({ length: n }, (_, i) => {
                  const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
                  const ms = byDay.get(iso);
                  const top = ms?.[0];
                  return (
                    <span key={iso} role="gridcell" title={ms?.map((x) => x.label).join(" · ")} aria-label={ms ? `${formatDate(iso)} : ${ms.map((x) => x.label).join(", ")}` : undefined}
                      className={`mx-auto flex size-7 items-center justify-center rounded-full ${top ? STYLE[top.kind] : iso === today ? "bg-muted font-bold" : ""}`}>{i + 1}</span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
