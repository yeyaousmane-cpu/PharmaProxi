import Link from "next/link";
import { Megaphone } from "lucide-react";
import { authorityContext } from "@/lib/authority-server";
import { getGeo } from "@/lib/geo";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { publishCommunique, withdrawCommunique } from "@/app/actions/authorities";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Communiqués officiels — SantéProxi Data", robots: { index: false } };

export default async function Communiques() {
  const ctx = await authorityContext("/autorites/communiques");
  if (!ctx.ok) return null;
  const geo = await getGeo();
  const { data: mine } = await ctx.supabase.from("official_communiques").select("id, title, organisation, status, published_at").order("published_at", { ascending: false }).limit(50);
  return (
    <div className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-bold text-brand-deep"><Megaphone className="size-5 text-primary" aria-hidden /> Communiqués officiels</h2>
      <p className="text-sm text-muted-foreground">Les institutions signataires d&apos;une convention publient ici leurs informations officielles (campagnes, alertes, consignes). Elles apparaissent sur la page publique <Link prefetch={false} href="/alertes" className="underline">Alertes sanitaires</Link>, avec le nom de l&apos;institution.</p>
      {ctx.canPublish ? (
        <section className="rounded-2xl border bg-white p-4 sm:p-5">
          <ActionForm action={publishCommunique} className="grid gap-3 sm:grid-cols-2" labels={{ title: "Titre", body: "Texte" }}>
            <Field label="Titre" htmlFor="ti" required className="sm:col-span-2"><Input id="ti" name="title" maxLength={160} required /></Field>
            <Field label="Texte du communiqué" htmlFor="bo" required className="sm:col-span-2"><Textarea id="bo" name="body" rows={6} maxLength={4000} required /></Field>
            <Field label="Lien vers le document officiel (facultatif)" htmlFor="li"><Input id="li" name="link" type="url" placeholder="https://" /></Field>
            <Field label="Région concernée" htmlFor="rg"><Select id="rg" name="region_id" defaultValue=""><option value="">Tout le Mali</option>{geo.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
            <p className="text-xs text-muted-foreground sm:col-span-2">Publié au nom de : <strong>{ctx.organisation}</strong>. Vous pourrez le retirer à tout moment.</p>
            <div className="sm:col-span-2"><SubmitButton>Publier</SubmitButton></div>
          </ActionForm>
        </section>
      ) : (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">La publication est ouverte après la signature d&apos;une convention entre votre institution et SantéProxi. Écrivez-nous depuis la page <Link prefetch={false} href="/infos/contact" className="underline">Contact</Link>.</p>
      )}
      <ul className="space-y-2">{(mine ?? []).map((c) => (
        <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white p-3 text-sm">
          <span><strong>{c.title}</strong> · {c.organisation} · {formatDateTime(c.published_at)} · <em>{c.status === "publie" ? "publié" : "retiré"}</em></span>
          {c.status === "publie" && <ActionForm action={withdrawCommunique}><input type="hidden" name="id" value={c.id} /><SubmitButton size="sm" variant="outline" confirm="Retirer ce communiqué ?">Retirer</SubmitButton></ActionForm>}
        </li>))}</ul>
    </div>
  );
}
