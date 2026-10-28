import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { addTeamMember, removeTeamMember } from "@/app/actions/pharmacy";
import { formatDate } from "@/lib/format";

type Member = { user_id: string; full_name: string | null; email: string; member_role: "owner" | "staff"; created_at: string };

/** Équipe de la pharmacie : le propriétaire ajoute ou retire des collaborateurs. */
export async function TeamCard({ pharmacyId, userId, editable }: { pharmacyId: string; userId: string; editable: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("pharmacy_team", { p_pharmacy: pharmacyId });
  const team = (data as Member[]) ?? [];
  const isOwner = team.some((m) => m.user_id === userId && m.member_role === "owner");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Users className="size-5" aria-hidden /> Équipe</CardTitle>
        <CardDescription>Les collaborateurs gèrent les stocks et les commandes. Seul le propriétaire gère l&apos;équipe et les justificatifs.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y text-sm">
          {team.map((m) => (
            <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-medium">{m.full_name ?? m.email}</span>{" "}
                <Badge className="bg-white">{m.member_role === "owner" ? "Propriétaire" : "Collaborateur"}</Badge>
                <span className="block text-xs text-muted-foreground">{m.email} · depuis le {formatDate(m.created_at)}</span>
              </span>
              {isOwner && editable && m.member_role !== "owner" && (
                <ActionForm action={removeTeamMember}>
                  <input type="hidden" name="pharmacy_id" value={pharmacyId} />
                  <input type="hidden" name="user_id" value={m.user_id} />
                  <SubmitButton size="sm" variant="outline" confirm={`Retirer ${m.email} de l'équipe ?`}>Retirer</SubmitButton>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
        {isOwner && editable && (
          <ActionForm action={addTeamMember} resetOnSuccess className="flex flex-col gap-2 sm:flex-row sm:items-end" labels={{ email: "E-mail" }}>
            <input type="hidden" name="pharmacy_id" value={pharmacyId} />
            <Field label="Ajouter un collaborateur (e-mail de son compte PharmaProxi)" htmlFor="team-email" className="flex-1">
              <Input id="team-email" name="email" type="email" required autoComplete="off" />
            </Field>
            <SubmitButton variant="secondary">Ajouter</SubmitButton>
          </ActionForm>
        )}
      </CardContent>
    </Card>
  );
}
