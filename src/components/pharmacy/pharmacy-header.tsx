import { Store } from "lucide-react";
import { getMyPharmacies, PHARMACY_STATUS_LABEL, type MyPharmacy } from "@/lib/pharmacy";
import { selectPharmacy } from "@/app/actions/pharmacy";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { DemoBadge } from "@/components/demo-badge";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const tone: Record<MyPharmacy["status"], string> = {
  verified: "border-emerald-200 bg-emerald-50 text-emerald-800",
  pending: "border-amber-200 bg-amber-50 text-amber-900",
  rejected: "border-red-200 bg-red-50 text-red-800",
  suspended: "border-red-200 bg-red-50 text-red-800",
};

export async function PharmacyHeader({ current, title }: { current: MyPharmacy; title: string }) {
  const all = await getMyPharmacies();
  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Store className="size-4" aria-hidden /> {current.name}
            <Badge className={tone[current.status]}>{PHARMACY_STATUS_LABEL[current.status]}</Badge>
            {current.is_demo && <DemoBadge />}
          </p>
        </div>
        {all.length > 1 && (
          <form action={selectPharmacy} className="flex gap-2">
            <label htmlFor="pharmacy_id" className="sr-only">Pharmacie</label>
            <Select id="pharmacy_id" name="pharmacy_id" defaultValue={current.id} className="h-9">
              {all.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <Button size="sm" variant="outline">Changer</Button>
          </form>
        )}
      </div>
      {current.status === "pending" && (
        <Alert tone="warning" title="Pharmacie en attente de vérification">
          Vous pouvez préparer vos stocks, mais votre pharmacie n&apos;apparaît pas dans les recherches tant qu&apos;un administrateur n&apos;a pas validé vos justificatifs.
        </Alert>
      )}
      {current.status === "rejected" && <Alert tone="error" title="Demande refusée">Consultez le motif dans « Ma pharmacie », corrigez puis soumettez à nouveau.</Alert>}
      {current.status === "suspended" && <Alert tone="error" title="Pharmacie suspendue">Votre pharmacie n&apos;est plus visible et ne peut plus être modifiée. Contactez l&apos;administration.</Alert>}
    </div>
  );
}
