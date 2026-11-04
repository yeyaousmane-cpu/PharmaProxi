import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Phone, Search, ShieldCheck, Store } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Pagination, pageRange } from "@/components/pagination";
import { createClient } from "@/lib/supabase/server";
import { getGeo } from "@/lib/geo";
import { formatDate, formatPhone } from "@/lib/format";
import { PROVIDER_CATEGORIES, PROVIDER_SINGULAR, isProviderCategory, type ProviderCategory } from "@/lib/insurance";
import { cn } from "@/lib/utils";

export const revalidate = 0;
type Row = { id: string; category: ProviderCategory; name: string; area: string | null; region_name: string | null; address: string | null; phones: string[]; pharmacy_id: string | null; total_count: number };
const SIZE = 30;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const supabase = await createClient();
  const { data } = await supabase.from("insurers").select("name").eq("slug", (await params).slug).maybeSingle();
  return { title: data ? `${data.name} : réseau de soins` : "Assurance" };
}

export default async function InsurerPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) notFound();
  const supabase = await createClient();
  const { data: ins } = await supabase.from("insurers").select("id, name, phone, website, network_date, network_source, notes").eq("slug", slug).maybeSingle();
  if (!ins) notFound();
  const cat = isProviderCategory(sp.type) ? sp.type : null;
  const region = sp.region && /^[0-9a-f-]{36}$/i.test(sp.region) ? sp.region : null;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const range = pageRange(sp.page, SIZE);
  const [{ data }, geo] = await Promise.all([
    supabase.rpc("search_insurer_network", { p_insurer: ins.id, p_query: q || null, p_category: cat, p_region: region, p_limit: SIZE, p_offset: range.from }),
    getGeo(),
  ]);
  const rows = (data as Row[] | null) ?? [];
  const total = rows[0]?.total_count ?? 0;
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: q || undefined, region: region ?? undefined, type: cat ?? undefined, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/assurances/${slug}?${s}` : `/assurances/${slug}`;
  };

  return (
    <div className="container-page space-y-5 py-6">
      <p className="text-sm"><Link prefetch={false} href="/assurances" className="text-primary underline">Assurances santé</Link> › {ins.name}</p>
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><ShieldCheck className="size-7 text-primary" aria-hidden /> {ins.name} : où aller avec ma carte ?</h1>
        <p className="text-muted-foreground">Pharmacies, cliniques, laboratoires et opticiens partenaires en tiers payant.</p>
        {(ins.phone || ins.website) && (
          <p className="flex flex-wrap gap-3 text-sm">
            {ins.phone && <a href={`tel:${ins.phone}`} className="inline-flex items-center gap-1.5 font-semibold text-primary"><Phone className="size-4" aria-hidden />{formatPhone(ins.phone)}</a>}
            {ins.website && <a href={ins.website} target="_blank" rel="noopener noreferrer" className="text-primary underline">Site de l&apos;assureur</a>}
          </p>
        )}
      </header>
      <Alert tone="info" title={ins.network_date ? `Liste des partenaires du ${formatDate(ins.network_date)}` : "Liste des partenaires"}>
        {ins.network_source ? `${ins.network_source}. ` : ""}{ins.notes ?? "La prise en charge dépend de votre contrat : en cas de doute, appelez votre assureur avant les soins."}
      </Alert>

      <form method="get" className="grid gap-2 rounded-2xl border bg-white p-3 sm:grid-cols-[1fr_220px_auto]" role="search">
        {cat && <input type="hidden" name="type" value={cat} />}
        <label htmlFor="q" className="sr-only">Nom ou quartier</label>
        <Input id="q" name="q" defaultValue={q} placeholder="Nom, quartier (ex. Hamdallaye)" />
        <label htmlFor="region" className="sr-only">Région</label>
        <Select id="region" name="region" defaultValue={region ?? ""}>
          <option value="">Toutes les régions</option>
          {geo.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
        <Button type="submit"><Search aria-hidden /> Chercher</Button>
      </form>

      <nav aria-label="Type de partenaire" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link prefetch={false} href={href({ type: undefined, page: undefined })} aria-current={!cat ? "page" : undefined}
          className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium", !cat ? "border-primary bg-primary text-white" : "bg-white")}>Tous</Link>
        {(Object.keys(PROVIDER_CATEGORIES) as ProviderCategory[]).filter((k) => k !== "autre").map((k) => (
          <Link key={k} prefetch={false} href={href({ type: k, page: undefined })} aria-current={cat === k ? "page" : undefined}
            className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium", cat === k ? "border-primary bg-primary text-white" : "bg-white")}>{PROVIDER_CATEGORIES[k]}</Link>
        ))}
      </nav>

      <p className="text-sm text-muted-foreground">{total} partenaire(s){cat ? ` · ${PROVIDER_CATEGORIES[cat].toLowerCase()}` : ""}{q ? ` pour « ${q} »` : ""}.</p>
      {rows.length === 0 ? (
        <p className="rounded-xl border bg-white p-4 text-sm">Aucun partenaire ne correspond. Essayez une autre région ou un autre type, ou appelez votre assureur.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-brand-deep">{r.name}</p>
                <Badge className="bg-brand-mint text-brand-deep">{PROVIDER_SINGULAR[r.category]}</Badge>
              </div>
              <p className="mt-1 flex items-start gap-1.5 text-muted-foreground"><MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />{[r.address, r.area, r.region_name && r.region_name !== r.area ? r.region_name : null].filter(Boolean).join(" — ")}</p>
              {r.phones.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {r.phones.map((p) => <a key={p} href={`tel:${p}`} className="inline-flex items-center gap-1.5 font-medium text-primary"><Phone className="size-3.5" aria-hidden />{formatPhone(p)}</a>)}
                </p>
              )}
              {r.pharmacy_id && (
                <Link prefetch={false} href={`/pharmacies/${r.pharmacy_id}`} className="mt-2 inline-flex items-center gap-1.5 font-semibold text-primary underline"><Store className="size-3.5" aria-hidden />Voir ses produits sur SantéProxi</Link>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pagination basePath={`/assurances/${slug}`} params={{ q: q || undefined, region: region ?? undefined, type: cat ?? undefined }} page={range.page} total={Number(total)} size={SIZE} />
    </div>
  );
}
