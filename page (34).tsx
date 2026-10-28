import Image from "next/image";
import Link from "next/link";
import { Building2, ShieldCheck, Stethoscope, Store } from "lucide-react";
import { SearchBar } from "@/components/search-bar";
import { HowItWorks } from "@/components/home/how-it-works";
import { DemoBadge } from "@/components/demo-badge";
import { Alert } from "@/components/ui/alert";
import { getGeo } from "@/lib/geo";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { formatAge } from "@/lib/format";
import { getSpecialties } from "@/lib/directory-server";

export const revalidate = 0;

type Recent = { id: string; name: string; address: string; region_name: string; commune_name: string | null; last_stock_update: string | null; products_count: number; is_demo: boolean };

export default async function Home() {
  const [geo, specialties] = await Promise.all([getGeo(), getSpecialties()]);
  const popular = ["medecine_generale", "pediatrie", "gynecologie", "cardiologie", "ophtalmologie", "dermatologie", "orl", "chirurgie_dentaire"]
    .map((c) => specialties.find((s) => s.code === c)).filter(Boolean) as typeof specialties;
  let recent: Recent[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("recent_pharmacies", { p_limit: 6 });
    recent = (data as Recent[]) ?? [];
  }

  return (
    <>
      <section className="bogolan border-b">
        <div className="container-page grid items-center gap-8 py-8 md:grid-cols-[1fr_1.2fr] md:py-14">
          <div className="flex flex-col items-center text-center md:items-start md:text-left">
            <Image src="/logo-320.webp" alt="PharmaProxi — Votre pharmacie, plus proche de vous." width={320} height={320} priority className="h-40 w-40 rounded-3xl bg-white p-2 shadow-sm md:h-64 md:w-64" />
            <p className="mt-2 max-w-md text-muted-foreground">
              Trouvez quelle pharmacie déclare avoir votre médicament, à quel prix, et faites-le confirmer avant de vous déplacer.
            </p>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm sm:p-6">
            <h1 className="mb-4 text-2xl font-bold text-brand-deep sm:text-3xl">Quel médicament recherchez-vous ?</h1>
            <SearchBar geo={geo} large />
          </div>
        </div>
      </section>

      <section className="border-b bg-gradient-to-b from-brand-sky to-white" aria-labelledby="doc-title">
        <div className="container-page grid gap-6 py-8 md:grid-cols-[1fr_1.2fr] md:items-center">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-blue"><Stethoscope className="size-4" aria-hidden /> Annuaire médical</p>
            <h2 id="doc-title" className="mt-1 text-2xl font-bold text-brand-deep">Besoin d&apos;un médecin spécialiste ?</h2>
            <p className="mt-2 text-muted-foreground">Trouvez le bon spécialiste, l&apos;établissement où il consulte, ses jours de consultation et un contact vérifié.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link prefetch={false} href="/medecins" className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-blue/90"><Stethoscope className="size-4" aria-hidden /> Trouver un spécialiste</Link>
              <Link prefetch={false} href="/cliniques" className="inline-flex h-11 items-center gap-2 rounded-lg border bg-white px-4 text-sm font-semibold hover:bg-muted"><Building2 className="size-4" aria-hidden /> Cliniques</Link>
            </div>
          </div>
          <ul className="flex flex-wrap gap-2" aria-label="Spécialités fréquentes">
            {popular.map((s) => (
              <li key={s.id}>
                <Link prefetch={false} href={`/medecins?specialite=${s.id}`} className="inline-block rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-brand-blue shadow-sm hover:bg-brand-sky">{s.name}</Link>
              </li>
            ))}
            <li><Link prefetch={false} href="/specialites" className="inline-block rounded-full px-4 py-2 text-sm font-semibold text-brand-blue underline">Quel spécialiste pour quoi ?</Link></li>
          </ul>
        </div>
      </section>

      <section className="container-page py-10" aria-labelledby="recent-title">
        <div className="flex items-end justify-between gap-4">
          <h2 id="recent-title" className="text-xl font-bold">Pharmacies récemment mises à jour</h2>
          <Link prefetch={false} href="/carte" className="text-sm font-semibold text-primary hover:underline">Voir la carte</Link>
        </div>
        {recent.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed bg-white p-6 text-center">
            <Store className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-2 font-medium">Aucune pharmacie vérifiée pour le moment.</p>
            <p className="text-sm text-muted-foreground">
              PharmaProxi est en cours de déploiement. Vous êtes pharmacien ?{" "}
              <Link prefetch={false} href="/pharmacien/inscription" className="font-semibold text-primary underline">Inscrivez votre pharmacie</Link>.
            </p>
          </div>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((p) => (
              <li key={p.id}>
                <Link prefetch={false} href={`/pharmacies/${p.id}`} className="block h-full rounded-xl border bg-white p-4 transition hover:border-primary hover:shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{p.name}</p>
                    <ShieldCheck className="size-5 shrink-0 text-brand-green" aria-label="Pharmacie vérifiée" />
                  </div>
                  <p className="text-sm text-muted-foreground">{[p.commune_name, p.region_name].filter(Boolean).join(", ")}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {p.last_stock_update ? `Stock actualisé ${formatAge(p.last_stock_update)} · ${p.products_count} produit(s)` : "Aucun stock déclaré pour le moment"}
                  </p>
                  {p.is_demo && <div className="mt-2"><DemoBadge /></div>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-y bg-white py-10" aria-labelledby="how-title">
        <div className="container-page">
          <h2 id="how-title" className="text-xl font-bold">Comment ça marche ?</h2>
          <div className="mt-4"><HowItWorks /></div>
        </div>
      </section>

      <section className="container-page py-10" aria-labelledby="safety-title">
        <h2 id="safety-title" className="text-xl font-bold">Bon usage et sécurité</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Alert tone="info" title="Une disponibilité est une déclaration">
            Elle est datée : vérifiez la date de mise à jour et faites confirmer avant de vous déplacer.
          </Alert>
          <Alert tone="warning" title="Ordonnance">
            Les médicaments sur ordonnance sont délivrés en pharmacie, sur présentation de l&apos;ordonnance. Ils ne sont jamais livrés automatiquement.
          </Alert>
          <Alert tone="error" title="Pas d'automédication">
            PharmaProxi ne pose aucun diagnostic et ne recommande aucun médicament. Demandez conseil à un professionnel de santé.
          </Alert>
        </div>
        <Link prefetch={false} href="/infos/securite" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">Lire toutes les consignes</Link>
      </section>
    </>
  );
}
