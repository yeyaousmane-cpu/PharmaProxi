import { Input } from "@/components/ui/input";
import { DAYS, DAY_LABELS } from "@/lib/validation";
import type { Schedule } from "@/lib/directory";

/**
 * Saisie d'un planning hebdomadaire : jusqu'à deux plages par jour (matin, après-midi).
 * Un jour laissé vide = pas de consultation / fermé.
 */
export function ScheduleFields({ value, idPrefix = "sch", legend, hint }: { value?: Schedule | null; idPrefix?: string; legend: string; hint?: string }) {
  const end = (t?: string) => (t === "24:00" ? "23:59" : t);
  return (
    <fieldset className="min-w-0">
      <legend className="text-base font-bold">{legend}</legend>
      <p className="mb-2 text-xs text-muted-foreground">{hint ?? "Laissez vide les jours sans consultation. Deuxième plage facultative. Heure du Mali."}</p>
      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[460px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="w-24 pb-1 font-medium">Jour</th>
              <th scope="col" className="pb-1 font-medium" colSpan={2}>Plage 1</th>
              <th scope="col" className="pb-1 font-medium" colSpan={2}>Plage 2 (facultative)</th>
            </tr>
          </thead>
          <tbody>
            {DAYS.map((d) => {
              const [a, b] = value?.[d] ?? [];
              return (
                <tr key={d}>
                  <th scope="row" className="py-1 pr-2 text-left font-medium">{DAY_LABELS[d]}</th>
                  <td className="py-1 pr-1"><Input id={`${idPrefix}-o-${d}`} aria-label={`Début ${DAY_LABELS[d]}`} name={`open_${d}`} type="time" defaultValue={a?.[0]} className="h-9" /></td>
                  <td className="py-1 pr-3"><Input aria-label={`Fin ${DAY_LABELS[d]}`} name={`close_${d}`} type="time" defaultValue={end(a?.[1])} className="h-9" /></td>
                  <td className="py-1 pr-1"><Input aria-label={`Début 2e plage ${DAY_LABELS[d]}`} name={`open2_${d}`} type="time" defaultValue={b?.[0]} className="h-9" /></td>
                  <td className="py-1"><Input aria-label={`Fin 2e plage ${DAY_LABELS[d]}`} name={`close2_${d}`} type="time" defaultValue={end(b?.[1])} className="h-9" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </fieldset>
  );
}
