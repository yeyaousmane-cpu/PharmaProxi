"use client";
import { useActionState } from "react";
import { importCsv } from "@/app/actions/pharmacy";
import { SubmitButton } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { CSV_COLUMNS } from "@/lib/csv";
import type { ActionState } from "@/lib/errors";

export function ImportForm({ pharmacyId }: { pharmacyId: string }) {
  const [state, action] = useActionState(importCsv, {} as ActionState);
  const errors = (state.data as { errors?: { row: number; error: string }[] } | undefined)?.errors ?? [];
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="pharmacy_id" value={pharmacyId} />
      <p className="text-sm text-muted-foreground">
        Fichier Excel (.xlsx, première feuille) ou CSV (séparateur « ; » ou « , », UTF-8). Colonnes : <code className="text-xs">{CSV_COLUMNS.join(" ; ")}</code>.
        Obligatoires : nom_commercial, quantite. <a href="/modele-import-stock.csv" className="text-primary underline" download>Télécharger le modèle</a>.
      </p>
      <Input type="file" name="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required aria-label="Fichier Excel ou CSV" />
      <SubmitButton variant="secondary" pendingText="Import en cours…">Importer</SubmitButton>
      {state.error && <Alert tone="error" title={state.error} />}
      {state.ok && <Alert tone={errors.length ? "warning" : "success"} title={state.message ?? "Import terminé"} />}
      {errors.length > 0 && (
        <div className="max-h-60 overflow-auto rounded-lg border text-sm">
          <table className="w-full"><thead><tr className="bg-muted text-start"><th className="p-2">Ligne</th><th className="p-2">Erreur</th></tr></thead>
            <tbody>{errors.map((e, i) => <tr key={i} className="border-t"><td className="p-2">{e.row}</td><td className="p-2">{e.error}</td></tr>)}</tbody></table>
        </div>
      )}
    </form>
  );
}
