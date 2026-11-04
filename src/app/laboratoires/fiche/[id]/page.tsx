import Link from "next/link";
import { notFound } from "next/navigation";
import { FlaskConical, Home, MapPin, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { FACILITY_KINDS } from "@/lib/directory";
import { formatDate, formatPhone, formatXof } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
const CAT: Record<string, string> = { biologie: "Analyses de biologie", imagerie: "Imagerie médicale", autre: "Autres examens" };
type E = { price_xof: number | null; price_note: string | null; delay: string | null; source: string; verified_at: string | null; medical_exams: { name: string; category: string } | null };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { title: "Laboratoire" };
  const supabase = await createClient();
  const { data } = await supabase.from("facility_listings").select("name").eq("id", id).maybeSingle();
  return { title: data ? `${data.name} — analyses et prix` : "Laboratoire" };
}

export default async function LabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: f }, { data: ex }, { data: home }] = await Promise.all([
    supabase.from("facility_listings").select("id, name, kind, address, city_label, phone, phone2, public_code, regions(name)").eq("id", id).maybeSingle(),
    supabase.from("facility_exams").select("price_xof, price_note, delay, source, verified_at, medical_exams(name, category)").eq("facility_id", id),
    supabase.from("lab_home_service").select("*").eq("facility_id", id).eq("enabled", true).maybeSingle(),
  ]);
  if (!f) notFound();
  const exams = ((ex ?? []) as unknown as E[]).filter((e) => e.medical_exams).sort((a, b) => a.medical_exams!.name.localeCompare(b.medical_exams!.name, "fr"));
  const region = Array.isArray(f.regions) ? f.regions[0] : f.regions;
  return (
    <div className="container-page max-w-3xl space-y-4 py-6">
      <p className="text-sm"><Link prefetch={false} href="/laboratoires" className="text-primary underline">Laboratoires et examens</Link> › {f.name}</p>
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><FlaskConical className="size-7 text-brand-blue" aria-hidden /> {f.name}</h1>
        <p className="text-sm text-muted-foreground">{FACILITY_KINDS[f.kind] ?? f.kind} · {f.city_label ?? (region as { name: string } | null)?.name ?? ""} · Identifiant {f.public_code}</p>
        {f.address && <p className="flex items-start gap-2 text-sm"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{f.address}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          {f.phone && <a href={`tel:${f.phone}`} className={cn(buttonVariants({ size: "sm" }))}><Phone aria-hidden /> {formatPhone(f.phone)}</a>}
          {home && <Link prefetch={false} href={`/laboratoires/domicile/${f.id}`} className={cn(buttonVariants({ size: "sm", variant: "secondary" }))}><Home aria-hidden /> Demander une prise de sang à domicile</Link>}
        </div>
      </header>
      {home && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm">
          <p className="font-semibold text-brand-blue">Prélèvement à domicile{home.fee_xof !== null ? ` · frais de déplacement : ${formatXof(home.fee_xof)}` : ""}</p>
          <p>{[home.areas && `Zones : ${home.areas}`, home.hours && `Passages : ${home.hours}`, home.partner_name && `Avec : ${home.partner_name}`].filter(Boolean).join(" · ")}</p>
          {home.conditions && <p className="mt-1">{home.conditions}</p>}
        </section>
      )}
      <section className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
        <h2 className="text-lg font-bold text-brand-deep">Analyses et examens ({exams.length})</h2>
        {exams.length === 0 ? <p className="text-sm text-muted-foreground">Ce laboratoire n&apos;a pas encore communiqué la liste de ses analyses. Appelez-le pour vous renseigner.</p> : (
          Object.keys(CAT).filter((c) => exams.some((e) => e.medical_exams!.category === c)).map((c) => (
            <div key={c}>
              <h3 className="mb-1 text-sm font-semibold text-muted-foreground">{CAT[c]}</h3>
              <ul className="divide-y text-sm">{exams.filter((e) => e.medical_exams!.category === c).map((e) => (
                <li key={e.medical_exams!.name} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span>{e.medical_exams!.name}{e.delay ? <span className="text-xs text-muted-foreground"> · résultat : {e.delay}</span> : null}</span>
                  <span className="text-right"><strong>{e.price_xof !== null ? formatXof(e.price_xof) : "Prix non communiqué"}</strong>{e.price_note ? <span className="block text-xs text-muted-foreground">{e.price_note}</span> : null}</span>
                </li>))}</ul>
            </div>))
        )}
        {exams.length > 0 && <p className="text-xs text-muted-foreground">Source : {exams[0].source}{exams[0].verified_at ? `, information du ${formatDate(exams[0].verified_at)}` : ""}. Confirmez le prix et les conditions (ordonnance, jeûne) par téléphone. SantéProxi ne choisit pas les analyses : c&apos;est le rôle de votre médecin.</p>}
      </section>
    </div>
  );
}
