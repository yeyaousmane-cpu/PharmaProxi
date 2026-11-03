import Link from "next/link";
import { Phone, Siren } from "lucide-react";
import { dossierContext, loadEssentials, loadItems } from "@/lib/dossier/server";
import { DossierGate } from "@/components/dossier/shell";
import { EmergencyImage } from "@/components/dossier/emergency-image";
import { formatPhone } from "@/lib/format";

export const metadata = { title: "Fiche d'urgence", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Urgence({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const sp = await searchParams;
  const ctx = await dossierContext(sp.p, "/ma-sante/dossier/urgence");
  if (ctx.locked) return <DossierGate status={ctx.status} path={`/ma-sante/dossier/urgence${sp.p ? `?p=${sp.p}` : ""}`} />;
  const { supabase, person } = ctx;
  const [items, ess] = await Promise.all([loadItems(supabase, person.id, ["allergie", "maladie"]), loadEssentials(supabase, person.id)]);
  const severe = items.filter((i) => i.kind === "allergie" && i.severity === "grave").map((i) => i.title);
  const other = items.filter((i) => i.kind === "allergie" && i.severity !== "grave").map((i) => i.title);
  const conditions = items.filter((i) => i.kind === "maladie").map((i) => i.title);
  const blood = ess?.blood_group && ess.blood_group !== "inconnu" ? ess.blood_group : null;
  const phone = ess?.emergency_phone ? formatPhone(ess.emergency_phone) ?? ess.emergency_phone : null;
  const contact = [ess?.emergency_name, ess?.emergency_relation && `(${ess.emergency_relation})`].filter(Boolean).join(" ") || null;
  const qp = person.is_self ? "" : `?p=${person.id}`;
  const missing = [!blood && "groupe sanguin", !phone && "personne à prévenir"].filter(Boolean);

  return (
    <div className="container-page max-w-xl space-y-4 py-6">
      <Link prefetch={false} href={`/ma-sante/dossier${qp}`} className="text-sm text-primary underline">← Retour au dossier</Link>
      <article className="overflow-hidden rounded-3xl border-2 border-red-600 bg-white">
        <h1 className="flex items-center gap-2 bg-red-700 px-5 py-3 text-xl font-bold text-white"><Siren className="size-6" aria-hidden /> Fiche d&apos;urgence</h1>
        <dl className="space-y-3 p-5">
          <div><dt className="text-xs uppercase text-muted-foreground">Nom</dt><dd className="text-lg font-bold">{person.display_name}{person.birth_year ? ` · né(e) en ${person.birth_year}` : ""}</dd></div>
          <div><dt className="text-xs uppercase text-muted-foreground">Groupe sanguin</dt><dd className="text-4xl font-black text-red-700">{blood ?? "Inconnu"}</dd></div>
          <div><dt className="text-xs uppercase text-muted-foreground">Allergies graves</dt><dd className="text-lg font-bold text-red-700">{severe.length ? severe.join(", ") : "Aucune connue"}</dd>
            {other.length > 0 && <dd className="text-sm">Autres allergies : {other.join(", ")}</dd>}</div>
          <div><dt className="text-xs uppercase text-muted-foreground">Maladies</dt><dd className="font-semibold">{conditions.length ? conditions.join(", ") : "Aucune déclarée"}</dd></div>
          {ess?.pregnant && <div><dd className="font-bold text-red-700">Enceinte</dd></div>}
          <div><dt className="text-xs uppercase text-muted-foreground">Personne à prévenir</dt>
            <dd>{phone ? <a href={`tel:${ess!.emergency_phone!.replace(/\s/g, "")}`} className="inline-flex items-center gap-2 text-lg font-bold text-primary"><Phone className="size-5" aria-hidden />{contact ? `${contact} — ` : ""}{phone}</a> : "Non renseignée"}</dd></div>
        </dl>
        <p className="border-t bg-muted/40 px-5 py-2 text-xs text-muted-foreground">Informations déclarées par la personne elle-même.</p>
      </article>
      {missing.length > 0 && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">À compléter : {missing.join(" et ")}, dans <Link prefetch={false} href={`/ma-sante/dossier${qp}`} className="underline">Mes informations essentielles</Link>.</p>}

      <section className="space-y-2 rounded-2xl border bg-white p-4">
        <h2 className="text-lg font-bold text-brand-deep">Visible même sans réseau, sur l&apos;écran verrouillé</h2>
        <p className="text-sm text-muted-foreground">Enregistrez la fiche en image et mettez-la en fond d&apos;écran verrouillé : si vous êtes inconscient, les secours la voient sans déverrouiller votre téléphone, même sans connexion.</p>
        <EmergencyImage data={{ name: person.display_name, blood, allergies: severe, conditions, contact, phone }} />
      </section>
    </div>
  );
}
