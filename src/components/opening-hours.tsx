import { DAYS, DAY_LABELS } from "@/lib/validation";

export function OpeningHours({ hours, verified }: { hours: Record<string, [string, string][]>; verified: boolean }) {
  const has = Object.keys(hours ?? {}).length > 0;
  if (!has) return <p className="text-sm text-muted-foreground">Horaires non renseignés.</p>;
  return (
    <div>
      <table className="w-full text-sm">
        <tbody>
          {DAYS.map((d) => (
            <tr key={d} className="border-b last:border-0">
              <th scope="row" className="py-1 pr-4 text-left font-medium">{DAY_LABELS[d]}</th>
              <td className="py-1 text-right">{hours[d]?.length ? hours[d].map(([o, c]) => `${o} – ${c}`).join(", ") : "Fermé"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">
        {verified ? "Horaires vérifiés par PharmaProxi." : "Horaires déclarés par la pharmacie, non vérifiés."} Heure du Mali.
      </p>
    </div>
  );
}
