import Link from "next/link";
import { BadgeCheck, BookOpen, CircleAlert, FileText, MapPin, Phone, Search, ShieldPlus } from "lucide-react";
import { AmoCalculator } from "@/components/amo/amo-calculator";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination, pageRange } from "@/components/pagination";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { AMO_STATUS_LABEL, DEFAULT_AMO_RATE, type AmoPharmacyStatus, type AmoSummary } from "@/lib/amo";
import { formatPhone, formatXof } from "@/lib/format";

export const metadata = {
  title: "AMO : médicaments pris en charge",
  description: "Liste des médicaments pris en charge par l'Assurance maladie obligatoire (CANAM) au Mali, tarif de référence et estimation du reste à payer.",
};
export const revalidate = 0;

type Row = { id: string; code: string | null; name: string; dci: string | null; tariff_xof: number | null; rate: number; patient_share: number | null; list_version: string; total_count: number };
type Ph = { status: AmoPharmacyStatus; pharmacies: { id: string; name: string; address: string; phone: string; communes: { name: string } | null; regions: { name: string } | null } | null };
const SIZE = 25;

export default async function AmoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const range = pageRange(sp.page, SIZE);
  let summary: AmoSummary | null = null;
  let rows: Row[] = [];
  let pharmacies: Ph[] = [];
  type Calc = { name: string; tariff_xof: number | null };
  let calc = null as Calc | null;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const calcId = sp.calc && /^[0-9a-f-]{36}$/i.test(sp.calc) ? sp.calc : null;
    const [s, r, p, c] = await Promise.all([
      supabase.rpc("amo_summary"),
      q.length >= 2 ? supabase.rpc("amo_search", { p_query: q, p_limit: SIZE, p_offset: range.from }) : Promise.resolve({ data: [] }),
      supabase.from("pharmacy_amo").select("status, pharmacies(id, name, address, phone, communes(name), regions(name))").in("status", ["verified", "declared"]).order("status", { ascending: false }).limit(60),
      calcId ? supabase.from("amo_medicines").select("name, tariff_xof").eq("id", calcId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    summary = (s.data as AmoSummary | null) ?? null;
    rows = (r.data as Row[] | null) ?? [];
    pharmacies = ((p.data as unknown as Ph[] | null) ?? []).filter((x) => x.pharmacies);
    calc = (c.data as Calc | null) ?? null;
  }
  const rate = Number(summary?.rate ?? DEFAULT_AMO_RATE);
  const total = rows[0]?.total_count ?? 0;
  const old = summary?.date ? new Date(summary.date) < new Date("2018-01-01") : false;

  return (
    <div className="container-page space-y-6 py-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><ShieldPlus className="size-7 text-primary" aria-hidden /> AMO : médicaments pris en charge</h1>
        <p className="max-w-3xl text-muted-foreground">
          Avec l&apos;Assurance maladie obligatoire (AMO), la CANAM prend en charge {rate} % du tarif de référence des médicaments de sa liste,
          achetés sur ordonnance dans une pharmacie conventionnée. Cherchez votre médicament et estimez ce qu&apos;il vous restera à payer.
        </p>
        <Link prefetch={false} href="/amo/guide" className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-brand-mint px-4 py-2.5 text-sm font-semibold text-brand-deep hover:border-primary">
          <BookOpen className="size-4" aria-hidden /> Tout savoir : qui a droit, cotisations, inscription INPS, assurance volontaire pour les non-salariés
        </Link>
      </header>

      {summary && summary.total > 0 ? (
        <Alert tone={old ? "warning" : "info"} title={summary.label ?? "Liste AMO"}>
          {summary.total.toLocaleString("fr-FR")} produits{summary.date ? ` · liste de ${new Date(summary.date).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" })}` : ""}.
          {summary.reference ? <> {summary.reference}</> : null}
          {old && <> Une liste plus récente existe : les tarifs affichés peuvent avoir changé. Faites toujours confirmer le montant par la pharmacie.</>}
          {summary.source ? <> <a href={summary.source} target="_blank" rel="noopener noreferrer" className="underline">Source</a>.</> : null}
        </Alert>
      ) : (
        <Alert tone="info" title="Liste en cours de chargement">La liste officielle des médicaments AMO n&apos;a pas encore été importée. La calculatrice ci-dessous fonctionne déjà.</Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section aria-labelledby="liste-t" className="space-y-3">
          <h2 id="liste-t" className="text-lg font-bold">Ce médicament est-il pris en charge ?</h2>
          <form method="get" className="flex gap-2" role="search">
            <label htmlFor="q" className="sr-only">Nom du médicament</label>
            <Input id="q" name="q" defaultValue={q} placeholder="Nom du médicament, ex. Doliprane 1000" minLength={2} required />
            <Button type="submit"><Search aria-hidden /> Chercher</Button>
          </form>
          {q.length >= 2 && rows.length === 0 && (
            <div className="rounded-xl border bg-white p-4 text-sm">
              <p className="font-semibold">Aucun produit de la liste ne correspond à « {q} ».</p>
              <p className="mt-1 text-muted-foreground">Essayez le nom écrit sur la boîte sans le dosage, ou le principe actif (ex. « paracetamol »). Un médicament absent de la liste n&apos;est pas remboursé par l&apos;AMO ; demandez au pharmacien s&apos;il existe un équivalent qui l&apos;est.</p>
            </div>
          )}
          {rows.length > 0 && (
            <>
              <p className="text-sm text-muted-foreground">{total} produit(s). « Vous payez » = reste à payer si la pharmacie applique le tarif de référence.</p>
              <ul className="divide-y rounded-xl border bg-white">
                {rows.map((r) => (
                  <li key={r.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.code ? `Code ${r.code} · ` : ""}{r.list_version}{r.dci ? ` · ${r.dci}` : ""}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4 text-sm">
                      <div className="text-end">
                        <p className="text-xs text-muted-foreground">Tarif de référence</p>
                        <p className="font-medium">{formatXof(r.tariff_xof)}</p>
                      </div>
                      <div className="text-end">
                        <p className="text-xs text-muted-foreground">Vous payez ≈</p>
                        <p className="font-bold text-brand-deep">{r.patient_share !== null ? formatXof(r.patient_share) : "—"}</p>
                      </div>
                      <Link prefetch={false} href={`/amo?${new URLSearchParams({ q, ...(sp.page ? { page: sp.page } : {}), calc: r.id })}#calcul`} className="text-xs font-semibold text-primary underline">Autre prix ?</Link>
                    </div>
                  </li>
                ))}
              </ul>
              <Pagination basePath="/amo" params={{ q }} page={range.page} total={Number(total)} size={SIZE} />
            </>
          )}
        </section>

        <div className="space-y-6">
          <AmoCalculator key={sp.calc ?? "libre"} rate={rate} initialTariff={calc?.tariff_xof ?? null} initialName={calc?.name ?? null} />
          <section aria-labelledby="cond-t" className="rounded-2xl border bg-white p-5 text-sm">
            <h2 id="cond-t" className="flex items-center gap-2 text-lg font-bold text-brand-deep"><FileText className="size-5 text-primary" aria-hidden /> Pour en bénéficier</h2>
            <ul className="mt-3 list-disc space-y-1.5 ps-5">
              <li>Être assuré AMO (ou ayant droit) avec des droits ouverts, et présenter sa carte.</li>
              <li>Une ordonnance d&apos;un prescripteur.</li>
              <li>Une pharmacie <strong>conventionnée</strong> avec la CANAM : vous ne payez alors que votre part (tiers payant).</li>
              <li>La base est le tarif de référence : si le prix est plus élevé, la différence est à votre charge.</li>
              <li>Selon la convention CANAM–officines, une délivrance couvre au plus un mois de traitement (45 jours pour certains protocoles).</li>
            </ul>
            <Link prefetch={false} href="/amo/guide" className="mt-3 inline-block font-semibold text-primary underline">Le guide complet AMO et INPS</Link>
            <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Pour une question sur vos droits, adressez-vous à la CANAM ou à votre organisme gestionnaire (INPS pour les salariés, CMSS pour les fonctionnaires).</p>
          </section>
        </div>
      </div>

      <section aria-labelledby="ph-t" className="space-y-3">
        <h2 id="ph-t" className="flex items-center gap-2 text-lg font-bold"><BadgeCheck className="size-5 text-brand-blue" aria-hidden /> Pharmacies conventionnées inscrites sur SantéProxi</h2>
        {pharmacies.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune pharmacie inscrite n&apos;a encore déclaré sa convention AMO. Demandez directement à votre pharmacie si elle est conventionnée.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pharmacies.map(({ status, pharmacies: p }) => (
              <li key={p!.id} className="rounded-xl border bg-white p-4 text-sm">
                <Link prefetch={false} href={`/pharmacies/${p!.id}`} className="font-semibold text-brand-deep hover:underline">{p!.name}</Link>
                <div className="mt-1"><Badge className={status === "verified" ? "border-blue-200 bg-blue-50 text-brand-blue" : "bg-white text-muted-foreground"}>{AMO_STATUS_LABEL[status]}</Badge></div>
                <p className="mt-2 flex items-start gap-1.5 text-muted-foreground"><MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />{[p!.address, p!.communes?.name, p!.regions?.name].filter(Boolean).join(", ")}</p>
                <a href={`tel:${p!.phone}`} className="mt-1 inline-flex items-center gap-1.5 font-medium text-primary"><Phone className="size-3.5" aria-hidden />{formatPhone(p!.phone)}</a>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">« Déclarée » : la pharmacie indique être conventionnée, l&apos;équipe SantéProxi ne l&apos;a pas encore vérifié.</p>
      </section>
    </div>
  );
}
