import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { updateSetting } from "@/app/actions/admin";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Paramètres — administration" };

export default async function AdminSettings() {
  const supabase = await createClient();
  const { data } = await supabase.from("platform_settings").select("key, value, description, updated_at").order("key");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Paramètres de la plateforme</h1>
      <Alert tone="warning" title="Livraison">N&apos;activez la livraison qu&apos;après vérification des règles applicables au Mali (catégories autorisées, conditions de transport, responsabilités). Activez ensuite les catégories concernées dans « Catalogue ».</Alert>
      <Card><CardHeader><CardTitle>Paramètres</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y">
            {(data ?? []).filter((s) => s.key !== "demo_enabled_delivery").map((s) => {
              const type = typeof s.value === "boolean" ? "boolean" : typeof s.value === "number" ? "number" : "string";
              return (
                <li key={s.key} className="py-3">
                  <ActionForm action={updateSetting} className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <input type="hidden" name="key" value={s.key} /><input type="hidden" name="type" value={type} />
                    <div className="text-sm"><p className="font-mono font-semibold">{s.key}</p><p className="text-muted-foreground">{s.description}</p><p className="text-xs text-muted-foreground">Modifié le {formatDateTime(s.updated_at)}</p></div>
                    <div className="flex flex-wrap items-center gap-2">
                      {type === "boolean" ? (
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="value" defaultChecked={s.value as boolean} className="size-4" /> Activé</label>
                      ) : (
                        <Input name="value" type={type === "number" ? "number" : "text"} defaultValue={String(s.value)} maxLength={200} className={type === "number" ? "h-9 w-32" : "h-9 w-72"} aria-label={s.key} />
                      )}
                      {s.key === "delivery_enabled" && <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="ack" className="size-4" /> Vérification réglementaire effectuée</label>}
                      <SubmitButton size="sm" variant="outline">Enregistrer</SubmitButton>
                    </div>
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        </CardContent></Card>
    </div>
  );
}
