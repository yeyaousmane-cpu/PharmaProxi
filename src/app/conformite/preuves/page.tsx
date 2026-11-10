import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DECISION, METHOD, bamako, parseFilters, type ProofRow } from "@/lib/compliance";

export default async function ProofsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: purposes } = await supabase.from("consent_purposes").select("code,title").eq("legal_basis", "consentement").order("sort");
  let found: { id: string; full_name: string | null; email: string }[] = []; let err = "";
  if (sp.q) { const r = await supabase.rpc("compliance_find_user", { p_query: sp.q }); if (r.error) err = r.error.message.replace(/^PP\d+:\s*/, ""); else found = r.data ?? []; }
  const f = parseFilters(sp);
  const searched = Object.values(f).some(Boolean) || sp.tout === "1";
  const { data } = searched ? await supabase.rpc("compliance_search", { ...f, p_export: false }) : { data: null };
  const rows = (data as ProofRow[] | null) ?? [];
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "q") as [string, string][]).toString();
  return (
    <div className="space-y-4">
      <form className="grid gap-2 rounded-2xl border bg-white p-4 sm:grid-cols-[1fr_auto]" role="search">
        <label className="text-sm font-semibold" htmlFor="q">Retrouver une personne (e-mail, téléphone ou identifiant)</label><span />
        <input id="q" name="q" defaultValue={sp.q} className="h-11 rounded-md border px-3" minLength={4} />
        <button className="rounded-xl bg-[#068132] px-4 font-semibold text-white">Chercher</button>
        {err && <p className="text-sm text-red-700 sm:col-span-2">{err}</p>}
        {found.length > 0 && <ul className="text-sm sm:col-span-2">{found.map((u) => <li key={u.id}><Link prefetch={false} href={`/conformite/preuves?user=${u.id}`} className="font-semibold text-[#068132] underline">{u.full_name ?? "Sans nom"} · {u.email}</Link></li>)}</ul>}
        {sp.q && !err && found.length === 0 && <p className="text-sm text-muted-foreground sm:col-span-2">Aucun compte trouvé.</p>}
      </form>
      <form className="grid gap-2 rounded-2xl border bg-white p-4 sm:grid-cols-5">
        {f.p_user && <input type="hidden" name="user" value={f.p_user} />}
        <label className="text-sm">Du<input type="date" name="du" defaultValue={sp.du} className="mt-1 h-10 w-full rounded-md border px-2" /></label>
        <label className="text-sm">Au<input type="date" name="au" defaultValue={sp.au} className="mt-1 h-10 w-full rounded-md border px-2" /></label>
        <label className="text-sm">Finalité<select name="finalite" defaultValue={sp.finalite ?? ""} className="mt-1 h-10 w-full rounded-md border px-2"><option value="">Toutes</option>{((purposes as { code: string; title: string }[] | null) ?? []).map((p) => <option key={p.code} value={p.code}>{p.title}</option>)}</select></label>
        <label className="text-sm">Statut<select name="statut" defaultValue={sp.statut ?? ""} className="mt-1 h-10 w-full rounded-md border px-2"><option value="">Tous</option><option value="accorde">Accepté</option><option value="refuse">Refusé</option><option value="retire">Retiré</option></select></label>
        <div className="flex items-end gap-2"><input type="hidden" name="tout" value="1" /><button className="h-10 rounded-xl bg-[#052D1E] px-4 text-sm font-semibold text-white">Filtrer</button></div>
      </form>
      {searched && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{rows.length} preuve(s){rows.length === 2000 ? " (limite atteinte, affinez)" : ""}</p>
            <a href={`/conformite/preuves/export?${qs}`} className="rounded-xl border px-3 py-1.5 text-sm font-semibold">Exporter (CSV)</a>
            {f.p_user && <Link prefetch={false} href={`/conformite/dossier/${f.p_user}`} className="rounded-xl bg-[#068132] px-3 py-1.5 text-sm font-semibold text-white">Dossier de preuve de cette personne</Link>}
          </div>
          <div className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full text-start text-sm">
            <thead><tr className="border-b"><th className="p-2">N°</th><th className="p-2">Date (Bamako)</th><th className="p-2">Personne</th><th className="p-2">Finalité</th><th className="p-2">Choix</th><th className="p-2">Texte / politique</th><th className="p-2">Canal</th><th className="p-2">Intégrité</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className="border-b align-top"><td className="p-2">{r.id}</td><td className="p-2 whitespace-nowrap">{bamako(r.created_at)}</td>
                <td className="p-2"><Link prefetch={false} href={`/conformite/dossier/${r.user_id}`} className="text-[#068132] underline">{r.user_name ?? r.user_id.slice(0, 8)}</Link></td>
                <td className="p-2">{r.purpose_title}</td><td className="p-2 font-semibold">{DECISION[r.decision] ?? r.decision}</td>
                <td className="p-2">v{r.purpose_version} · {r.policy_version ? `politique v${r.policy_version}` : "—"}</td><td className="p-2">{METHOD[r.method] ?? r.method}</td>
                <td className="p-2">{r.text_sha256 ? (r.text_ok ? <span className="text-emerald-700">✓ texte vérifié</span> : <span className="font-semibold text-red-700">✗ empreinte invalide</span>) : <span className="text-muted-foreground">avant v0.26</span>}</td></tr>))}</tbody>
          </table></div>
        </section>
      )}
    </div>
  );
}
