import Link from "next/link";
import QRCode from "qrcode";
import { Award, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { getGeo } from "@/lib/geo";
import { formatDate } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Input, Select } from "@/components/ui/input";
import { declareTraining, setBadgeVisibility } from "@/app/actions/v037";
import { CERT_STATUS } from "@/lib/first-aid";

export const metadata = { title: "Badge « Citoyen sauveteur formé »", robots: { index: false } };
export const dynamic = "force-dynamic";

type Cert = { id: string; course_label: string; completed_on: string; expires_on: string | null; status: string; decision_note: string | null; verify_token: string; show_name: boolean; verified_at: string | null; first_aid_organizations: { name: string } | null };

export default async function Badge() {
  await requireUser("/premiers-secours/badge");
  const supabase = await createClient();
  const geo = await getGeo();
  const [c, o] = await Promise.all([
    supabase.from("first_aid_certifications").select("id, course_label, completed_on, expires_on, status, decision_note, verify_token, show_name, verified_at, first_aid_organizations(name)").order("created_at", { ascending: false }),
    supabase.from("first_aid_organizations").select("id, name").eq("published", true).order("name"),
  ]);
  const certs = (c.data ?? []) as unknown as Cert[]; const orgs = (o.data ?? []) as { id: string; name: string }[];
  const today = new Date().toISOString().slice(0, 10);
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const qr = await Promise.all(certs.map((x) => (x.status === "verifiee" ? QRCode.toDataURL(`${base}/premiers-secours/badge/${x.verify_token}`, { margin: 1, width: 220 }) : Promise.resolve(null))));
  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <p className="text-sm"><Link prefetch={false} href="/premiers-secours" className="text-primary underline">← Premiers secours</Link></p>
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><Award className="size-7 text-amber-600" aria-hidden /> Badge « Citoyen sauveteur formé »</h1>
        <p className="text-muted-foreground">Le badge atteste une formation pratique suivie auprès d&apos;un organisme reconnu. Il n&apos;est jamais délivré automatiquement : lire les fiches ou regarder des vidéos ne suffit pas. L&apos;organisme formateur (ou l&apos;administration SantéProxi sur sa confirmation) doit valider votre formation.</p>
      </header>
      {certs.length > 0 && (
        <ul className="space-y-3">{certs.map((x, i) => {
          const st = x.status === "verifiee" && x.expires_on && x.expires_on < today ? "expiree" : x.status;
          return (
            <li key={x.id} className="space-y-3 rounded-2xl border bg-white p-4 text-sm">
              {st === "verifiee" ? (
                <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-gradient-to-br from-amber-100 to-red-100 p-4">
                  {qr[i] && <img src={qr[i]!} alt="QR code de vérification du badge" width={120} height={120} className="rounded-lg bg-white p-1" />}
                  <div className="space-y-1"><p className="flex items-center gap-1 text-lg font-extrabold text-red-900"><ShieldCheck className="size-5" aria-hidden /> Citoyen sauveteur formé</p>
                    <p>{x.first_aid_organizations?.name} · {x.course_label}</p>
                    <p className="text-xs">Formation du {formatDate(x.completed_on)}{x.expires_on ? ` · à renouveler avant le ${formatDate(x.expires_on)}` : ""} · identifiant {x.verify_token.slice(0, 8).toUpperCase()}</p></div>
                </div>
              ) : <p className="font-semibold">{x.course_label} — {x.first_aid_organizations?.name} · {formatDate(x.completed_on)}</p>}
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${CERT_STATUS[st][1]}`}>{CERT_STATUS[st][0]}</span>
              {x.decision_note && <p className="text-xs">Note de l&apos;organisme : {x.decision_note}</p>}
              {x.status === "verifiee" && (
                <div className="flex flex-wrap gap-2">
                  <ActionForm action={setBadgeVisibility}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="show" value={x.show_name ? "0" : "1"} />
                    <SubmitButton size="sm" variant="outline">{x.show_name ? "Masquer mon prénom sur la vérification" : "Afficher mon prénom et l'initiale de mon nom à la vérification"}</SubmitButton></ActionForm>
                  <ActionForm action={setBadgeVisibility}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="show" value={x.show_name ? "1" : "0"} /><input type="hidden" name="renew" value="1" />
                    <SubmitButton size="sm" variant="ghost" confirm="Créer un nouveau QR code ? L'ancien ne fonctionnera plus.">Nouveau QR code</SubmitButton></ActionForm>
                  <Link prefetch={false} href={`/premiers-secours/badge/${x.verify_token}`} className="text-xs font-semibold text-primary underline">Voir la page de vérification</Link>
                </div>
              )}
            </li>);
        })}</ul>
      )}
      <section className="space-y-3 rounded-2xl border bg-white p-4">
        <h2 className="text-lg font-bold text-brand-deep">Déclarer une formation suivie</h2>
        <p className="text-sm text-muted-foreground">L&apos;organisme formateur vérifiera votre participation. Gardez votre attestation papier : elle peut vous être demandée.</p>
        <ActionForm action={declareTraining} className="grid gap-3 text-sm sm:grid-cols-2">
          <label>Organisme formateur<Select name="organization_id" required defaultValue="" className="mt-1 h-11"><option value="" disabled>Choisir</option>{orgs.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></label>
          <label>Intitulé de la formation<Input name="course_label" required minLength={3} maxLength={160} placeholder="ex. Premiers secours — niveau 1" className="mt-1 h-11" /></label>
          <label>Date de la formation<Input name="completed_on" type="date" required max={today} className="mt-1 h-11" /></label>
          <label>Région (pour les statistiques par région)<Select name="region_id" defaultValue="" className="mt-1 h-11"><option value="">—</option>{geo.regions.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></label>
          <label className="sm:col-span-2">Référence de votre attestation (facultatif)<Input name="evidence_note" maxLength={300} className="mt-1 h-11" placeholder="ex. numéro d'attestation, lieu de la session" /></label>
          <label className="flex items-start gap-2 sm:col-span-2"><input type="checkbox" name="show_name" className="mt-1 size-4" /> Afficher mon prénom et l&apos;initiale de mon nom sur la page de vérification du badge (sinon, aucun nom n&apos;y apparaît).</label>
          <div><SubmitButton>Déclarer ma formation</SubmitButton></div>
        </ActionForm>
      </section>
    </div>
  );
}
