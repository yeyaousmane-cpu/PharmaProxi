import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { sendAnnouncement } from "@/app/actions/announcements";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { isMailConfigured } from "@/lib/mailer";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { WELCOME } from "@/lib/welcome";

export const metadata = { title: "Annonces — administration" };
export const maxDuration = 60;

const AUDIENCES: Record<string, string> = {
  tous: "Tous les inscrits", clients: "Clients", pharmaciens: "Pharmaciens", medecins: "Médecins", etablissements: "Cliniques et établissements", livreurs: "Livreurs",
};

export default async function AdminAnnouncements({ searchParams }: { searchParams: Promise<{ modele?: string }> }) {
  const sp = await searchParams;
  const welcome = sp.modele !== "libre";
  const supabase = await createClient();
  const [{ data: history }, { count: users }] = await Promise.all([
    supabase.from("announcements").select("id, title, audience, kind, in_app_count, email_requested, email_sent, email_failed, created_at").order("created_at", { ascending: false }).limit(30),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
  ]);
  const mail = isMailConfigured();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Annonces aux inscrits</h1>
      <p className="text-sm text-muted-foreground">
        Chaque destinataire reçoit l&apos;annonce dans la cloche de son compte et, si vous le cochez, par e-mail (un e-mail par personne : personne ne voit les adresses des autres).
        Les comptes de démonstration ne reçoivent rien. {users ?? 0} compte(s) inscrit(s).
      </p>
      {!mail && (
        <Alert tone="warning" title="Envoi d'e-mails non configuré">
          Les annonces arrivent dans les comptes, mais pas encore par e-mail. Ajoutez SMTP_USER et SMTP_PASS dans Vercel (voir le guide de déploiement), puis redéployez.
        </Alert>
      )}
      <nav className="flex flex-wrap gap-2" aria-label="Modèle">
        {[["bienvenue", "Message de bienvenue"], ["libre", "Annonce libre"]].map(([k, l]) => (
          <Link prefetch={false} key={k} href={`/admin/annonces?modele=${k}`} aria-current={(k === "bienvenue") === welcome ? "page" : undefined}
            className={cn("rounded-full border px-4 py-2 text-sm font-medium", (k === "bienvenue") === welcome ? "border-brand-blue bg-brand-sky text-brand-blue" : "bg-white")}>{l}</Link>
        ))}
      </nav>
      <Card>
        <CardHeader>
          <CardTitle>{welcome ? "Message de bienvenue" : "Nouvelle annonce"}</CardTitle>
          <CardDescription>
            {welcome
              ? "Envoyé une seule fois par personne : ceux qui l'ont déjà reçu (dans leur compte ou par e-mail) ne le reçoivent pas deux fois. Les nouveaux inscrits le reçoivent automatiquement dans leur compte."
              : "Nouvelle fonctionnalité, information pratique… Restez bref et utile ; pas de publicité pour un professionnel de santé."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={sendAnnouncement} className="space-y-4" labels={{ title: "Titre", body: "Message" }} key={welcome ? "w" : "l"}>
            <input type="hidden" name="kind" value={welcome ? "welcome" : "announcement"} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Destinataires" htmlFor="an-aud">
                <Select id="an-aud" name="audience" defaultValue="tous">
                  {Object.entries(AUDIENCES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </Select>
              </Field>
              <Field label="Lien dans le site (facultatif)" htmlFor="an-link" hint="Ex. /garde, /rendez-vous, /laboratoires">
                <Input id="an-link" name="link" defaultValue={welcome ? "/" : ""} maxLength={200} placeholder="/" />
              </Field>
            </div>
            <Field label="Titre (objet de l'e-mail)" htmlFor="an-title" required><Input id="an-title" name="title" required maxLength={120} defaultValue={welcome ? WELCOME.title : ""} /></Field>
            <Field label="Message" htmlFor="an-body" required hint="Laissez une ligne vide entre deux paragraphes. « Bonjour [prénom], » est ajouté automatiquement dans l'e-mail.">
              <Textarea id="an-body" name="body" rows={10} required maxLength={3000} defaultValue={welcome ? WELCOME.body : ""} />
            </Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="email" defaultChecked={mail} disabled={!mail} className="size-4" /> Envoyer aussi par e-mail</label>
            <SubmitButton pendingText="Envoi en cours…" confirm="Envoyer cette annonce maintenant ? Elle ne peut pas être annulée.">Envoyer l&apos;annonce</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Annonces envoyées</CardTitle></CardHeader>
        <CardContent>
          {!history?.length ? <p className="text-sm text-muted-foreground">Aucune annonce pour le moment.</p> : (
            <ul className="divide-y text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <span><span className="font-medium">{h.title}</span> <span className="text-xs text-muted-foreground">· {AUDIENCES[h.audience]} · {formatDateTime(h.created_at)}</span></span>
                  <span className="text-xs text-muted-foreground">
                    {h.in_app_count} notification(s){h.email_requested ? ` · ${h.email_sent} e-mail(s)${h.email_failed ? `, ${h.email_failed} en échec` : ""}` : " · sans e-mail"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
