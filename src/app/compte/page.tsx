import Link from "next/link";
import { MapPin, Package, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getGeo } from "@/lib/geo";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocationPicker } from "@/components/location-picker";
import { addAddress, deleteAccount, deleteAddress, updateProfile } from "@/app/actions/account";
import { signOut } from "@/app/actions/auth";
import { formatPhone } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Mon compte" };

export default async function AccountPage() {
  const s = await requireUser("/compte");
  const supabase = await createClient();
  const [{ data: profile }, { data: addresses }, geo] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, preferred_region_id, preferred_commune_id, notify_in_app").eq("id", s.userId).single(),
    supabase.from("customer_addresses").select("id, label, address_line, landmark, contact_phone, communes(name), regions(name)").eq("user_id", s.userId).order("created_at"),
    getGeo(),
  ]);
  return (
    <div className="container-page max-w-3xl space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Mon compte</h1>
        <div className="flex gap-2">
          <Link prefetch={false} href="/compte/commandes" className={cn(buttonVariants({ variant: "secondary" }))}><Package aria-hidden /> Mes commandes</Link>
          <form action={signOut}><button className={cn(buttonVariants({ variant: "outline" }))}>Déconnexion</button></form>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Profil</CardTitle><CardDescription>{s.email}</CardDescription></CardHeader>
        <CardContent>
          <ActionForm action={updateProfile} className="space-y-4" labels={{ full_name: "Nom", phone: "Téléphone" }}>
            <Field label="Nom complet" htmlFor="full_name" required><Input id="full_name" name="full_name" defaultValue={profile?.full_name ?? ""} required /></Field>
            <Field label="Téléphone" htmlFor="phone" hint="Utile pour que la pharmacie vous rappelle"><Input id="phone" name="phone" type="tel" defaultValue={formatPhone(profile?.phone)} /></Field>
            <div>
              <p className="mb-2 text-sm font-medium">Zone préférée pour la recherche</p>
              <LocationPicker geo={geo} names={{ region: "preferred_region_id", commune: "preferred_commune_id" }}
                defaults={{ region: profile?.preferred_region_id ?? undefined, commune: profile?.preferred_commune_id ?? undefined }} />
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify_in_app" defaultChecked={profile?.notify_in_app ?? true} className="size-4" /> Recevoir les notifications de suivi de commande</label>
            <SubmitButton>Enregistrer</SubmitButton>
          </ActionForm>
          <Link prefetch={false} href="/compte/mot-de-passe" className="mt-4 inline-block text-sm text-primary underline">Changer mon mot de passe</Link>
        </CardContent>
      </Card>

      <Card id="adresses">
        <CardHeader><CardTitle>Adresses de livraison</CardTitle><CardDescription>Utilisées uniquement si la livraison est disponible.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {(addresses ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Aucune adresse enregistrée.</p> : (
            <ul className="divide-y rounded-lg border">
              {(addresses ?? []).map((a) => {
                const c = Array.isArray(a.communes) ? a.communes[0] : a.communes;
                const r = Array.isArray(a.regions) ? a.regions[0] : a.regions;
                return (
                  <li key={a.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                    <div className="flex gap-2"><MapPin className="mt-0.5 size-4 text-brand-green" aria-hidden />
                      <div><p className="font-medium">{a.label}</p><p>{a.address_line}{a.landmark ? ` (${a.landmark})` : ""}</p>
                        <p className="text-muted-foreground">{[c?.name, r?.name].filter(Boolean).join(", ")} · {formatPhone(a.contact_phone)}</p></div>
                    </div>
                    <form action={deleteAddress}><input type="hidden" name="id" value={a.id} />
                      <button className="rounded p-2 text-destructive hover:bg-red-50" aria-label={`Supprimer l'adresse ${a.label}`}><Trash2 className="size-4" /></button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-semibold">Ajouter une adresse</summary>
            <ActionForm action={addAddress} resetOnSuccess className="mt-3 space-y-3" labels={{ label: "Libellé", region_id: "Région", address_line: "Adresse", contact_phone: "Téléphone" }}>
              <Field label="Libellé" htmlFor="label" required><Input id="label" name="label" defaultValue="Domicile" required maxLength={40} /></Field>
              <LocationPicker geo={geo} requiredRegion names={{ region: "region_id", commune: "commune_id", locality: "locality_id" }} />
              <Field label="Adresse" htmlFor="address_line" required hint="Rue, porte, bâtiment"><Input id="address_line" name="address_line" required maxLength={300} /></Field>
              <Field label="Point de repère" htmlFor="landmark"><Input id="landmark" name="landmark" maxLength={200} /></Field>
              <Field label="Téléphone de contact" htmlFor="contact_phone" required><Input id="contact_phone" name="contact_phone" type="tel" required /></Field>
              <SubmitButton size="sm">Ajouter</SubmitButton>
            </ActionForm>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Espaces professionnels</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link prefetch={false} href="/pharmacien/inscription" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Inscrire une pharmacie</Link>
          <Link prefetch={false} href="/livraison" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Devenir livreur</Link>
        </CardContent>
      </Card>

      <Card className="border-red-200">
        <CardHeader><CardTitle className="text-destructive">Supprimer mon compte</CardTitle>
          <CardDescription>Vos adresses et notifications sont effacées et votre profil anonymisé. L&apos;historique des commandes est conservé de façon anonyme pour les obligations légales.</CardDescription></CardHeader>
        <CardContent>
          <ActionForm action={deleteAccount} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="Tapez SUPPRIMER pour confirmer" htmlFor="confirm" className="flex-1"><Input id="confirm" name="confirm" autoComplete="off" /></Field>
            <SubmitButton variant="destructive" confirm="Supprimer définitivement votre compte ?">Supprimer</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
