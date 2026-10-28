import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { reviewCourier } from "@/app/actions/admin";
import { formatDate, formatPhone } from "@/lib/format";

export const metadata = { title: "Livreurs — administration" };
const ST: Record<string, string> = { pending: "En attente", verified: "Vérifié", suspended: "Suspendu", rejected: "Refusé" };
type C = { user_id: string; full_name: string | null; email: string; phone: string; status: string; vehicle: string | null; zone: string; id_document_ref: string | null; is_available: boolean; active_deliveries: number; created_at: string };

export default async function AdminCouriers() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_couriers", { p_status: null });
  const list = (data as C[]) ?? [];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Livreurs</h1>
      <p className="text-sm text-muted-foreground">Vérifiez l&apos;identité (pièce officielle), le moyen de transport et la zone avant toute habilitation. Seuls les livreurs vérifiés peuvent être affectés.</p>
      {!list.length ? <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">Aucune candidature.</p> : (
        <ul className="divide-y rounded-xl border bg-white">
          {list.map((c) => (
            <li key={c.user_id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <strong>{c.full_name ?? c.email}</strong><Badge className="bg-white">{ST[c.status]}</Badge>
                <span className="text-muted-foreground">{formatPhone(c.phone)} · {c.vehicle ?? "—"} · {c.zone || "zone non précisée"} · depuis le {formatDate(c.created_at)} · {c.active_deliveries} livraison(s) en cours</span>
              </div>
              <ActionForm action={reviewCourier} className="grid gap-2 sm:grid-cols-[160px_1fr_1fr_auto] sm:items-end">
                <input type="hidden" name="user_id" value={c.user_id} />
                <Select name="status" defaultValue={c.status === "pending" ? "verified" : c.status} aria-label="Nouveau statut" className="h-9">
                  <option value="verified">Vérifier / réactiver</option><option value="suspended">Suspendre</option><option value="rejected">Refuser</option>
                </Select>
                <Input name="document_ref" placeholder="Réf. pièce d'identité vérifiée" defaultValue={c.id_document_ref ?? ""} className="h-9" aria-label="Référence de la pièce" />
                <Input name="reason" placeholder="Motif (obligatoire si refus/suspension)" className="h-9" aria-label="Motif" />
                <SubmitButton size="sm" confirm="Enregistrer cette décision ?">Enregistrer</SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
