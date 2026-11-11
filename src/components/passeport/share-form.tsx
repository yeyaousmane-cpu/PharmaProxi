"use client";
import { useActionState, useState } from "react";
import { Copy, QrCode } from "lucide-react";
import { createShare } from "@/app/actions/v028";
import type { ActionState } from "@/lib/errors";
import { SHARE_DURATIONS, SHARE_SECTIONS } from "@/lib/passeport";

type Created = { url: string; qr: string; reference: string; expires_at: string };

/** Création d'un partage du passeport santé. Le lien et le QR code ne sont affichés qu'une seule fois. */
export function ShareForm({ personId, personName, selfOnly }: { personId: string; personName: string; selfOnly: boolean }) {
  const [state, action, pending] = useActionState(createShare, {} as ActionState);
  const [copied, setCopied] = useState(false);
  const made = state.ok ? (state.data as Created) : null;
  const sections = Object.entries(SHARE_SECTIONS).filter(([k]) => selfOnly || !["traitements", "mesures"].includes(k));
  return (
    <div className="space-y-4">
      {made && (
        <div role="status" className="min-w-0 overflow-hidden rounded-2xl border-2 border-[#068132]/40 bg-[#EAF6EE] p-4">
          <p className="flex items-center gap-2 font-bold text-[#052D1E]"><QrCode className="size-5" aria-hidden /> Partage {made.reference} créé</p>
          <p className="mt-1 text-sm">Montrez ce QR code ou envoyez ce lien à la personne de votre choix. <strong>Il ne sera plus affiché</strong> après avoir quitté cette page : notez-le maintenant, ou créez-en un autre plus tard.</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
            <div className="w-fit max-w-full rounded-xl bg-white p-2 [&_svg]:h-auto [&_svg]:max-w-full" aria-label="QR code du partage" dangerouslySetInnerHTML={{ __html: made.qr }} />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="break-all rounded-lg bg-white p-2 font-mono text-xs" dir="ltr" data-testid="share-url">{made.url}</p>
              <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(made.url); setCopied(true); } catch { /* copie manuelle */ } }}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#052D1E]/25 bg-white px-4 text-sm font-semibold"><Copy className="size-4" aria-hidden /> {copied ? "Lien copié" : "Copier le lien"}</button>
              <p className="text-xs text-muted-foreground">Toute personne qui possède ce lien peut voir les informations choisies jusqu&apos;à son expiration. Vous êtes prévenu(e) à chaque consultation et pouvez le retirer à tout moment.</p>
            </div>
          </div>
        </div>
      )}
      <form action={action} className="space-y-3">
        <input type="hidden" name="person_id" value={personId} />
        <fieldset>
          <legend className="text-sm font-semibold">Informations de {personName} à partager</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {sections.map(([k, label]) => (
              <label key={k} className="flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm"><input type="checkbox" name="sections" value={k} className="size-4" /> {label}</label>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Rien n&apos;est coché d&apos;avance. Vos documents, analyses et consultations ne sont jamais inclus.</p>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm"><span className="font-semibold">Durée de validité</span>
            <select name="hours" defaultValue="24" className="mt-1 h-11 w-full rounded-lg border bg-white px-2">{SHARE_DURATIONS.map(([h, l]) => <option key={h} value={h}>{l}</option>)}</select></label>
          <label className="text-sm"><span className="font-semibold">Pour qui ? (facultatif, pour vous y retrouver)</span>
            <input name="label" maxLength={80} placeholder="ex. Dr Traoré, urgences" className="mt-1 h-11 w-full rounded-lg border px-3" /></label>
        </div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="accord" className="mt-1 size-4" required />
          <span>Je choisis de partager ces informations de santé avec la personne à qui je donnerai le lien, pour la durée indiquée.</span></label>
        <button disabled={pending} className="min-h-11 rounded-xl bg-[#052D1E] px-5 font-semibold text-white disabled:opacity-60">{pending ? "Création…" : "Créer le partage"}</button>
        {state.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-900">{state.error}</p>}
      </form>
    </div>
  );
}
