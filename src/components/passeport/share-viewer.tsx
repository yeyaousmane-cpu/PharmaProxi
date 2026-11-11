"use client";
import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { openShare } from "@/app/actions/v028";
import { measureValue, type ShareView } from "@/lib/passeport";

const MSG: Record<string, string> = {
  invalide: "Ce lien n'est pas valide.", retire: "Ce partage a été retiré par la personne concernée.", expire: "Ce partage a expiré.",
  trop: "Trop de tentatives. Réessayez dans quelques minutes.", erreur: "Le service est momentanément indisponible. Réessayez dans un instant.",
};
const day = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("fr-FR") : "");

/** La consultation n'a lieu qu'après un appui : un simple aperçu de lien ne révèle rien et n'est pas compté. */
export function ShareViewer({ token }: { token: string }) {
  const [view, setView] = useState<ShareView | null>(null);
  const [viewer, setViewer] = useState("");
  const [pending, start] = useTransition();
  if (!view) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); start(async () => setView(await openShare(token, viewer))); }} className="space-y-3 rounded-2xl border bg-white p-5">
        <p className="flex items-start gap-2 text-sm"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#068132]" aria-hidden />Une personne vous a confié un accès temporaire à des informations de santé. En les affichant, votre consultation est enregistrée et la personne en est informée.</p>
        <label className="block text-sm"><span className="font-semibold">Qui consulte ? (facultatif)</span>
          <input value={viewer} onChange={(e) => setViewer(e.target.value)} maxLength={80} placeholder="ex. Dr Traoré, centre de santé" className="mt-1 h-11 w-full rounded-lg border px-3" /></label>
        <button disabled={pending} className="min-h-11 rounded-xl bg-[#052D1E] px-5 font-semibold text-white disabled:opacity-60">{pending ? "Ouverture…" : "Afficher les informations"}</button>
      </form>
    );
  }
  if (view.status !== "ok") return <p role="alert" className="rounded-2xl border bg-amber-50 p-5 font-semibold text-amber-950">{MSG[view.status]}</p>;
  const Block = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="rounded-2xl border bg-white p-4"><h2 className="font-bold text-[#052D1E]">{title}</h2><div className="mt-1 text-sm">{children}</div></section>;
  const none = <span className="text-muted-foreground">Rien d&apos;indiqué par la personne.</span>;
  return (
    <div className="space-y-3">
      <p className="rounded-xl bg-[#EAF6EE] p-3 text-sm text-[#052D1E]">Partage <span className="font-mono" dir="ltr">{view.reference}</span>, valable jusqu&apos;au {new Date(view.expires_at).toLocaleString("fr-FR")}. Informations déclarées par la personne elle-même, non vérifiées par SantéProxi.</p>
      {view.identite && <Block title="Identité">{view.identite.nom}{view.identite.annee_naissance ? ` · né(e) en ${view.identite.annee_naissance}` : ""}{view.identite.sexe ? ` · ${view.identite.sexe}` : ""}</Block>}
      {"groupe_sanguin" in view && <Block title="Groupe sanguin">{view.groupe_sanguin && view.groupe_sanguin !== "inconnu" ? <span className="text-lg font-bold">{view.groupe_sanguin}</span> : none}</Block>}
      {view.allergies && <Block title="Allergies">{view.allergies.length ? <ul className="list-disc ps-5">{view.allergies.map((a) => <li key={a.titre}><strong>{a.titre}</strong>{a.gravite ? ` (${a.gravite})` : ""}{a.detail ? ` — ${a.detail}` : ""}</li>)}</ul> : none}</Block>}
      {view.maladies && <Block title="Maladies déclarées">{view.maladies.length ? <ul className="list-disc ps-5">{view.maladies.map((a) => <li key={a.titre}>{a.titre}{a.annee ? ` (depuis ${a.annee})` : ""}</li>)}</ul> : none}</Block>}
      {view.traitements && <Block title="Traitements en cours">{view.traitements.length ? <ul className="list-disc ps-5">{view.traitements.map((a) => <li key={a.nom}>{a.nom}{a.indication ? ` — ${a.indication}` : ""}</li>)}</ul> : none}</Block>}
      {view.vaccins && <Block title="Vaccins">{view.vaccins.length ? <ul className="list-disc ps-5">{view.vaccins.map((a, i) => <li key={i}>{a.titre}{a.date ? ` — ${day(a.date)}` : ""}</li>)}</ul> : none}</Block>}
      {view.mesures && <Block title="Dernières mesures notées par la personne">{view.mesures.length ? <ul className="space-y-0.5">{view.mesures.map((m, i) => <li key={i}><span className="text-muted-foreground">{new Date(m.measured_at).toLocaleString("fr-FR")}</span> — <span dir="ltr">{measureValue(m)}</span></li>)}</ul> : none}</Block>}
      {"medecin_traitant" in view && <Block title="Médecin traitant">{view.medecin_traitant?.nom ? <>{view.medecin_traitant.nom}{view.medecin_traitant.structure ? ` — ${view.medecin_traitant.structure}` : ""}{view.medecin_traitant.telephone ? <> — <a className="font-semibold underline" href={`tel:${view.medecin_traitant.telephone}`}>{view.medecin_traitant.telephone}</a></> : null}</> : none}</Block>}
      {view.contact_urgence && <Block title="Personne à prévenir">{view.contact_urgence.nom ? <>{view.contact_urgence.nom}{view.contact_urgence.lien ? ` (${view.contact_urgence.lien})` : ""}{view.contact_urgence.telephone ? <> — <a className="font-semibold underline" href={`tel:${view.contact_urgence.telephone.replace(/\s/g, "")}`}>{view.contact_urgence.telephone}</a></> : null}</> : none}</Block>}
    </div>
  );
}
