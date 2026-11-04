import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getGeo } from "@/lib/geo";
import { SamplingForm } from "@/components/lab/sampling-form";
import { formatXof } from "@/lib/format";

export const metadata = { title: "Demander une prise de sang à domicile" };
export const dynamic = "force-dynamic";

export default async function Request({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  await requireUser(`/laboratoires/domicile/${id}`);
  const supabase = await createClient();
  const [{ data: f }, { data: svc }, { data: offered }, { data: all }, geo] = await Promise.all([
    supabase.from("facility_listings").select("id, name").eq("id", id).maybeSingle(),
    supabase.from("lab_home_service").select("*").eq("facility_id", id).eq("enabled", true).maybeSingle(),
    supabase.from("facility_exams").select("exam_id, price_xof").eq("facility_id", id),
    supabase.from("medical_exams").select("id, name, category").eq("is_active", true).eq("category", "biologie").order("name"),
    getGeo(),
  ]);
  if (!f || !svc) notFound();
  const price = new Map((offered ?? []).map((o) => [o.exam_id, o.price_xof as number | null]));
  // Analyses du laboratoire d'abord ; sinon tout le catalogue de biologie
  const exams = (all ?? []).filter((e) => !price.size || price.has(e.id)).map((e) => ({ id: e.id, name: e.name, price: price.get(e.id) ?? null }));
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  return (
    <div className="container-page max-w-2xl space-y-4 py-6">
      <p className="text-sm"><Link prefetch={false} href="/laboratoires/domicile" className="text-primary underline">Prise de sang à domicile</Link> › {f.name}</p>
      <h1 className="text-2xl font-bold text-brand-deep">Prise de sang à domicile — {f.name}</h1>
      <p className="text-sm text-muted-foreground">{[svc.fee_xof !== null && `Frais de déplacement : ${formatXof(svc.fee_xof)}`, svc.areas && `Zones : ${svc.areas}`, svc.hours && `Passages : ${svc.hours}`].filter(Boolean).join(" · ")}</p>
      {svc.conditions && <p className="rounded-xl bg-blue-50 p-3 text-sm">{svc.conditions}</p>}
      <section className="rounded-2xl border bg-white p-4 sm:p-5"><SamplingForm facilityId={f.id} exams={exams} regions={geo.regions} tomorrow={tomorrow} resultsEnabled={Boolean(svc.results_enabled)} /></section>
    </div>
  );
}
