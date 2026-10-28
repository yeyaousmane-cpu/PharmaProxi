"use client";
import { Flag } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Select, Textarea } from "@/components/ui/input";
import { submitReport } from "@/app/actions/orders";

export function ReportForm({ pharmacyId, orderId }: { pharmacyId?: string; orderId?: string }) {
  return (
    <details className="rounded-xl border bg-white p-4">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><Flag className="size-4" aria-hidden /> Signaler un problème</summary>
      <ActionForm action={submitReport} className="mt-3 space-y-3" resetOnSuccess>
        <input type="hidden" name="pharmacy_id" value={pharmacyId ?? ""} />
        <input type="hidden" name="order_id" value={orderId ?? ""} />
        <Field label="Motif" htmlFor="reason" required>
          <Select id="reason" name="reason" required defaultValue="stock_incorrect">
            <option value="stock_incorrect">Stock incorrect</option>
            <option value="prix_incorrect">Prix incorrect</option>
            <option value="pharmacie_fermee">Pharmacie fermée / horaires faux</option>
            <option value="informations_erronees">Informations erronées</option>
            <option value="comportement">Comportement inapproprié</option>
            <option value="produit_suspect">Produit suspect</option>
            <option value="autre">Autre</option>
          </Select>
        </Field>
        <Field label="Précisions" htmlFor="description">
          <Textarea id="description" name="description" maxLength={1000} rows={3} />
        </Field>
        <SubmitButton size="sm">Envoyer le signalement</SubmitButton>
      </ActionForm>
    </details>
  );
}
