import Link from "next/link";
import { BookOpen, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Lexique des analyses", description: "Comprendre simplement à quoi sert une analyse médicale : NFS, glycémie, électrophorèse de l'hémoglobine, ECBU…" };
export const revalidate = 600;

const CAT: Record<string, string> = { biologie: "Analyses de sang, d'urines et de selles", imagerie: "Imagerie", autre: "Autres examens" };
type E = { id: string; code: string; name: string; category: string; lay_text: string; lay_validated_by: string | null; lay_validated_at: string | null };

/** Seuls les textes validés par un professionnel de santé sont affichés. */
export default async function Lexique() {
  let rows: E[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    rows = ((await supabase.from("medical_exams").select("id, code, name, category, lay_text, lay_validated_by, lay_validated_at").eq("is_active", true).eq("lay_status", "valide").not("lay_text", "is", null).order("name")).data ?? []) as E[];
  }
  const groups = Object.keys(CAT).map((c) => [c, rows.filter((r) => r.category === c)] as const).filter(([, l]) => l.length);
  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><BookOpen className="size-7 text-primary" aria-hidden /> Lexique des analyses</h1>
        <p className="text-muted-foreground">À quoi sert l&apos;analyse que le médecin vous a demandée, et comment elle se passe. Ces explications ne servent pas à interpréter un résultat : seul votre médecin peut le faire, avec votre situation.</p>
      </header>
      {rows.length === 0 ? (
        <p className="rounded-2xl border bg-white p-4 text-sm text-muted-foreground">Les explications sont en cours de relecture par des professionnels de santé. Elles apparaîtront ici dès leur validation.</p>
      ) : groups.map(([c, list]) => (
        <section key={c} className="space-y-2">
          <h2 className="text-lg font-bold text-brand-deep">{CAT[c]}</h2>
          <ul className="space-y-2">{list.map((e) => (
            <li key={e.id} id={e.code} className="scroll-mt-24 rounded-2xl border bg-white p-4">
              <h3 className="font-bold text-brand-deep">{e.name}</h3>
              <p className="mt-1 text-sm">{e.lay_text}</p>
              <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" aria-hidden />Relu par {e.lay_validated_by}{e.lay_validated_at ? ` le ${formatDate(e.lay_validated_at)}` : ""} · <Link prefetch={false} href={`/laboratoires?examen=${e.id}`} className="text-primary underline">Où la faire et à quel prix</Link></p>
            </li>))}</ul>
        </section>))}
    </div>
  );
}
