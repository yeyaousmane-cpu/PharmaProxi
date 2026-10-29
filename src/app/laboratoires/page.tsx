import Link from "next/link";
import { FlaskConical, MapPin, Navigation, Phone, ScanLine } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Pagination } from "@/components/pagination";
import { directionsUrl } from "@/components/result-card";
import { getGeo } from "@/lib/geo";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { FACILITY_KINDS } from "@/lib/directory";
import { formatDate, formatPhone, formatXof } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Laboratoires et examens",
  description: "Où faire une analyse ou un examen d'imagerie au Mali, avec les tarifs lorsqu'ils sont communiqués par l'établissement.",
};
export const revalidate = 0;

type Exam = { id: string; code: string; name: string; category: "biologie" | "imagerie" | "autre"; description: string | null };
type Row = {
  facility_id: string; name: string; kind: string; region_name: string | null; city_label: string | null; address: string | null;
  phone: string | null; phone2: string | null; latitude: number | null; longitude: number | null; price_xof: number | null;
  price_note: string | null; delay: string | null; source: string; verified_at: string | null; exams_count: number; total_count: number;
};
const SIZE = 30;
const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const CAT: Record<Exam["category"], string> = { biologie: "Analyses de biologie", imagerie: "Imagerie médicale", autre: "Autres examens" };

export default async function LabsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const examId = uuid(sp.examen);
  let exams: Exam[] = [];
  let rows: Row[] = [];
  let failed = false;
  const geo = await getGeo();
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const [e, r] = await Promise.all([
      supabase.from("medical_exams").select("id, code, name, category, description").order("sort_order").order("name"),
      supabase.rpc("search_labs", {
        p_exam: examId, p_query: sp.q?.trim().slice(0, 80) || null, p_region: uuid(sp.region),
        p_sort: examId && sp.tri === "prix" ? "price" : "name", p_limit: SIZE, p_offset: (page - 1) * SIZE,
      }),
    ]);
    exams = (e.data as Exam[]) ?? [];
    rows = (r.data as Row[]) ?? [];
    failed = Boolean(r.error);
  }
  const exam = exams.find((x) => x.id === examId) ?? null;
  const total = rows[0]?.total_count ? Number(rows[0].total_count) : 0;
  const priced = rows.filter((r) => r.price_xof !== null).length;

  return (
    <div className="container-page space-y-4 py-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><FlaskConical className="size-6 text-brand-blue" aria-hidden /> Laboratoires et examens</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Trouvez où faire une analyse ou un examen d&apos;imagerie. Les tarifs ne sont affichés que s&apos;ils ont été <strong>communiqués par l&apos;établissement</strong>,
          avec leur date : confirmez toujours le prix et les conditions (ordonnance, jeûne, rendez-vous) par téléphone.
        </p>
      </div>

      <form method="get" className="grid gap-2 rounded-xl border bg-white p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto] lg:items-end">
        <Select name="examen" defaultValue={examId ?? ""} aria-label="Examen">
          <option value="">Tous les laboratoires et centres d&apos;imagerie</option>
          {(["biologie", "imagerie", "autre"] as const).map((c) => (
            <optgroup key={c} label={CAT[c]}>
              {exams.filter((x) => x.category === c).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </optgroup>
          ))}
        </Select>
        <Select name="region" defaultValue={sp.region ?? ""} aria-label="Région">
          <option value="">Toutes les régions</option>
          {geo.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
        <Input name="q" defaultValue={sp.q} placeholder="Nom de l'établissement" aria-label="Nom de l'établissement" />
        {examId && <input type="hidden" name="tri" value={sp.tri ?? ""} />}
        <Button type="submit">Rechercher</Button>
      </form>

      {exam && (
        <div className="flex flex-col gap-2 rounded-xl border bg-brand-sky/40 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm"><strong>{exam.name}</strong>{exam.description ? ` — ${exam.description}` : ""}</p>
          {priced > 1 && (
            <Link prefetch={false} className="text-sm font-semibold text-primary underline"
              href={`/laboratoires?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && k !== "page" && k !== "tri")) as Record<string, string>, ...(sp.tri === "prix" ? {} : { tri: "prix" }) })}`}>
              {sp.tri === "prix" ? "Trier par nom" : "Comparer les tarifs communiqués"}
            </Link>
          )}
        </div>
      )}

      <p className="text-sm font-medium" aria-live="polite">
        {failed ? "Le service ne répond pas pour le moment. Réessayez dans un instant." : `${total} établissement${total > 1 ? "s" : ""}${exam ? ` déclarant réaliser cet examen` : ""}`}
      </p>

      {rows.length === 0 && !failed ? (
        <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Aucun établissement {exam ? "n'a encore déclaré cet examen" : "trouvé avec ces critères"}.</p>
          <p className="mt-1">La liste des examens est complétée au fur et à mesure que les laboratoires nous communiquent leurs informations. Vous pouvez aussi consulter les <Link prefetch={false} href="/cliniques" className="font-semibold text-primary underline">cliniques et hôpitaux</Link>.</p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <li key={r.facility_id} className="flex flex-col gap-2 rounded-xl border bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-base font-bold">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{FACILITY_KINDS[r.kind] ?? r.kind} · {r.city_label ?? r.region_name ?? "Ville non précisée"}</p>
                </div>
                {exam && (
                  <div className="text-right">
                    <p className="font-bold">{r.price_xof !== null ? formatXof(r.price_xof) : "Tarif non communiqué"}</p>
                    {r.price_note && <p className="text-xs text-muted-foreground">{r.price_note}</p>}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge className="bg-muted text-muted-foreground">Non vérifié par PharmaProxi</Badge>
                {exam && r.delay && <Badge className="bg-white">Résultat : {r.delay}</Badge>}
                {!exam && r.exams_count > 0 && <Badge className="bg-white"><ScanLine className="size-3" aria-hidden /> {r.exams_count} examen(s) renseigné(s)</Badge>}
              </div>
              {exam && <p className="text-xs text-muted-foreground">Source : {r.source}{r.verified_at ? ` · information du ${formatDate(r.verified_at)}` : ""}</p>}
              {r.address && <p className="flex items-start gap-2 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{r.address}</p>}
              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                {r.phone && <a href={`tel:${r.phone}`} className={cn(buttonVariants({ size: "sm" }))}><Phone aria-hidden /> {formatPhone(r.phone)}</a>}
                {r.phone2 && <a href={`tel:${r.phone2}`} className={cn(buttonVariants({ size: "sm", variant: "outline" }))}><Phone aria-hidden /> {formatPhone(r.phone2)}</a>}
                {r.latitude !== null && r.longitude !== null && (
                  <a href={directionsUrl(r.latitude, r.longitude)} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><Navigation aria-hidden /> Itinéraire</a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pagination basePath="/laboratoires" params={sp} page={page} total={total} size={SIZE} />
      <Alert tone="info" title="Information, pas une prescription">
        Un examen se fait sur prescription ou conseil d&apos;un professionnel de santé. Cette page indique seulement où il est proposé.
      </Alert>
      <p className="text-xs text-muted-foreground">
        Vous dirigez un laboratoire ? Communiquez-nous vos examens, tarifs et délais : <Link prefetch={false} href="/infos/contact" className="underline">contactez-nous</Link>.
      </p>
    </div>
  );
}
