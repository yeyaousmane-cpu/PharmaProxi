"use client";
import { Flag } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Select, Textarea } from "@/components/ui/input";
import { submitDirectoryReport } from "@/app/actions/directory";

/** Signalement d'une fiche de l'annuaire (ANN-11). */
export function DirectoryReportForm({ doctorId, clinicId }: { doctorId?: string; clinicId?: string }) {
  const id = doctorId ? `rep-d-${doctorId.slice(0, 6)}` : `rep-c-${clinicId?.slice(0, 6)}`;
  return (
    <details className="rounded-xl border bg-white p-4">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><Flag className="size-4" aria-hidden /> Signaler une information erronée</summary>
      <ActionForm action={submitDirectoryReport} className="mt-3 space-y-3" resetOnSuccess>
        <input type="hidden" name="doctor_id" value={doctorId ?? ""} />
        <input type="hidden" name="clinic_id" value={clinicId ?? ""} />
        <Field label="Motif" htmlFor={`${id}-reason`} required>
          <Select id={`${id}-reason`} name="reason" required defaultValue="numero_errone">
            <option value="numero_errone">Numéro erroné ou injoignable</option>
            {doctorId && <option value="ne_consulte_plus">Ne consulte plus à cet endroit</option>}
            <option value="informations_erronees">Autres informations erronées</option>
            <option value="comportement">Comportement inapproprié</option>
            <option value="autre">Autre</option>
          </Select>
        </Field>
        <Field label="Précisions" htmlFor={`${id}-desc`}>
          <Textarea id={`${id}-desc`} name="description" maxLength={1000} rows={3} />
        </Field>
        <SubmitButton size="sm">Envoyer le signalement</SubmitButton>
      </ActionForm>
    </details>
  );
}
