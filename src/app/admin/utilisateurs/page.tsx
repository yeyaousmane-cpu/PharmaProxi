import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { setRole } from "@/app/actions/admin";
import { formatDate, formatPhone } from "@/lib/format";
import { humanizeError } from "@/lib/errors";

export const metadata = { title: "Utilisateurs — administration" };
const ROLE_LABEL: Record<string, string> = { customer: "Client", pharmacist: "Pharmacien", courier: "Livreur", admin: "Administrateur" };

type U = { id: string; email: string; full_name: string | null; phone: string | null; roles: string[]; created_at: string; deleted_at: string | null };

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const me = await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_find_users", { p_query: sp.q ?? null, p_limit: 100 });
  const users = (data as U[]) ?? [];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Utilisateurs et rôles</h1>
      <Alert tone="info" title="Principe du moindre privilège">Le rôle pharmacien est accordé automatiquement à l&apos;inscription d&apos;une pharmacie (sans la rendre vérifiée) ; le rôle livreur via la validation des livreurs. N&apos;accordez le rôle administrateur qu&apos;aux personnes habilitées.</Alert>
      <form method="get"><Input name="q" placeholder="E-mail, nom ou téléphone…" defaultValue={sp.q} aria-label="Rechercher un utilisateur" /></form>
      {error && <Alert tone="error" title={humanizeError(error)} />}
      <ul className="divide-y rounded-xl border bg-white">
        {users.map((u) => (
          <li key={u.id} className="flex flex-col gap-2 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm">
              <p className="font-semibold">{u.full_name ?? "(sans nom)"} <span className="font-normal text-muted-foreground">{u.email}</span></p>
              <p className="text-muted-foreground">{formatPhone(u.phone)} · inscrit le {formatDate(u.created_at)}{u.deleted_at ? " · compte supprimé" : ""}</p>
              <div className="mt-1 flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r} className="bg-white">{ROLE_LABEL[r]}</Badge>)}</div>
            </div>
            {!u.deleted_at && (
              <div className="flex flex-wrap gap-2">
                {u.roles.includes("admin") ? (
                  u.id !== me.userId && <ActionForm action={setRole}><input type="hidden" name="user_id" value={u.id} /><input type="hidden" name="role" value="admin" /><input type="hidden" name="grant" value="false" />
                    <SubmitButton size="sm" variant="outline" confirm="Retirer le rôle administrateur ?">Retirer admin</SubmitButton></ActionForm>
                ) : (
                  <ActionForm action={setRole}><input type="hidden" name="user_id" value={u.id} /><input type="hidden" name="role" value="admin" /><input type="hidden" name="grant" value="true" />
                    <SubmitButton size="sm" variant="outline" confirm={`Accorder le rôle administrateur à ${u.email} ?`}>Rendre admin</SubmitButton></ActionForm>
                )}
                {u.roles.includes("pharmacist") && <ActionForm action={setRole}><input type="hidden" name="user_id" value={u.id} /><input type="hidden" name="role" value="pharmacist" /><input type="hidden" name="grant" value="false" />
                  <SubmitButton size="sm" variant="outline" confirm="Retirer le rôle pharmacien ? L'utilisateur ne pourra plus gérer de pharmacie.">Retirer pharmacien</SubmitButton></ActionForm>}
              </div>
            )}
          </li>
        ))}
        {!users.length && <li className="p-6 text-center text-sm text-muted-foreground">Aucun utilisateur trouvé.</li>}
      </ul>
    </div>
  );
}
