import { Download } from "lucide-react";
import { FemmeGate, Privacy } from "@/components/femme/gate";
import { fmt } from "@/components/femme/bits";
import { F } from "@/components/femme/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { deleteFemmeAll, setFemmePartner, setFemmePin, updateFemmeProfile } from "@/app/actions/femme";
import { femmeData, femmeStatus, isTeen } from "@/lib/femme/server";
import { createClient } from "@/lib/supabase/server";
import { notesEncrypted } from "@/lib/femme/crypto";
import { todayIso } from "@/lib/femme/cycle";
import { AGE_BANDS, AGE_LABEL, JOURNEYS, PARTNER_TOPICS, REGULARITY } from "@/lib/femme/labels";
import { SITE_URL } from "@/lib/env";

export const metadata = { title: "Réglages", robots: { index: false } };
const ACTIONS: Record<string, string> = {
  activation: "Création de l'espace", code_defini: "Code secret défini", code_retire: "Code secret retiré", code_errone: "Code erroné saisi",
  deverrouillage: "Ouverture avec le code", export: "Export des données", partage_active: "Partage partenaire activé", partage_desactive: "Partage partenaire désactivé",
};

export default async function SettingsPage() {
  const st = await femmeStatus();
  const gate = FemmeGate({ st, path: "/femme/reglages" });
  if (gate) return gate;
  const today = todayIso();
  const supabase = await createClient();
  const [{ profile }, tok, log] = await Promise.all([
    femmeData({ daysFrom: today }),
    supabase.rpc("femme_partner_token"),
    supabase.from("femme_access_log").select("action, at").order("at", { ascending: false }).limit(10),
  ]);
  if (!profile) return null;
  const teen = isTeen(profile);
  const token = tok.data as string | null;

  return (
    <div className="space-y-4">
      <section className={`${F.card} space-y-3`}>
        <h1 className="text-xl font-bold text-[#843653]">Mon profil</h1>
        <ActionForm action={updateFemmeProfile} className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">Tranche d&apos;âge<select name="age_band" defaultValue={profile.age_band} className={F.input}>{AGE_BANDS.map((a) => <option key={a} value={a}>{AGE_LABEL[a]}</option>)}</select></label>
          <label className="space-y-1 text-sm font-medium">Situation<select name="journey" defaultValue={profile.journey} className={F.input}>
            {Object.entries(JOURNEYS).filter(([k]) => !(teen && (k === "conception" || k === "menopause"))).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
          <label className="space-y-1 text-sm font-medium">Durée habituelle du cycle (jours)<input type="number" name="cycle_length" min={15} max={60} defaultValue={profile.cycle_length} className={F.input} /></label>
          <label className="space-y-1 text-sm font-medium">Durée habituelle des règles (jours)<input type="number" name="period_length" min={1} max={15} defaultValue={profile.period_length} className={F.input} /></label>
          <label className="space-y-1 text-sm font-medium">Régularité<select name="regularity" defaultValue={profile.regularity} className={F.input}>{Object.entries(REGULARITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="space-y-1 text-sm font-medium">Grossesse : dernières règles<input type="date" name="pregnancy_lmp" max={today} defaultValue={profile.pregnancy_lmp ?? ""} className={F.input} /></label>
          <label className="space-y-1 text-sm font-medium">Grossesse : date prévue d&apos;accouchement<input type="date" name="pregnancy_due" defaultValue={profile.pregnancy_due ?? ""} className={F.input} /></label>
          <label className="space-y-1 text-sm font-medium">Date de l&apos;accouchement<input type="date" name="delivery_date" max={today} defaultValue={profile.delivery_date ?? ""} className={F.input} /></label>
          <div className="sm:col-span-2"><SubmitButton className={F.btn}>Enregistrer le profil</SubmitButton></div>
        </ActionForm>
      </section>

      <section className={`${F.card} space-y-3`}>
        <h2 className={F.h2}>Discrétion et rappels</h2>
        <ActionForm action={updateFemmeProfile} className="space-y-3">
          <input type="hidden" name="_prefs" value="1" />
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="discreet" defaultChecked={profile.discreet} className="mt-0.5 size-5 accent-[#D96A91]" />
            <span><strong>Mode discret</strong> : l&apos;espace s&apos;intitule simplement « Mon espace », sans mention de santé féminine.</span></label>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="remind_period" defaultChecked={profile.remind_period} className="mt-0.5 size-5 accent-[#D96A91]" />
            <span><strong>Prévenir avant mes prochaines règles estimées</strong></span></label>
          <label className="flex max-w-xs items-center gap-2 text-sm">Combien de jours avant ?<input type="number" name="remind_days_before" min={0} max={7} defaultValue={profile.remind_days_before} className={`${F.input} w-20`} /></label>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="remind_log" defaultChecked={profile.remind_log} className="mt-0.5 size-5 accent-[#D96A91]" />
            <span><strong>Me rappeler de noter mon journal</strong> (au plus une fois par semaine si rien n&apos;a été noté)</span></label>
          <SubmitButton className={F.btn}>Enregistrer</SubmitButton>
        </ActionForm>
        <p className="text-xs text-muted-foreground">Les rappels arrivent dans vos notifications PharmaProxi, avec un texte neutre. Aucun e-mail ni SMS n&apos;est envoyé pour cet espace.</p>
      </section>

      <section className={`${F.card} space-y-3`}>
        <h2 className={F.h2}>Code secret</h2>
        <p className="text-sm">{st.has_pin ? "Votre espace est protégé : il se verrouille après 30 minutes sans activité, ou quand vous touchez « Verrouiller »." : "Ajoutez un code de 4 à 6 chiffres : sans lui, quiconque utilise votre téléphone connecté pourrait voir votre espace."}</p>
        <ActionForm action={setFemmePin} resetOnSuccess className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="space-y-1 text-sm font-medium">{st.has_pin ? "Nouveau code" : "Code"}<input type="password" name="pin" inputMode="numeric" pattern="[0-9]{4,6}" maxLength={6} autoComplete="new-password" required className={F.input} /></label>
          <label className="space-y-1 text-sm font-medium">Confirmer<input type="password" name="confirm" inputMode="numeric" pattern="[0-9]{4,6}" maxLength={6} autoComplete="new-password" required className={F.input} /></label>
          <SubmitButton className={F.btn}>{st.has_pin ? "Changer" : "Activer le code"}</SubmitButton>
        </ActionForm>
        {st.has_pin && (
          <ActionForm action={setFemmePin}><input type="hidden" name="remove" value="1" /><SubmitButton variant="ghost" size="sm" confirm="Retirer le code secret ?">Retirer le code</SubmitButton></ActionForm>
        )}
      </section>

      {!teen && (
        <section className={`${F.card} space-y-3`}>
          <h2 className={F.h2}>Espace partenaire (facultatif)</h2>
          <p className="text-sm">Partagez un lien vers des <strong>contenus pédagogiques</strong> choisis par vous (par exemple « Accompagner une femme enceinte »). Le lien ne montre <strong>jamais</strong> vos règles, symptômes, données de fertilité ni aucune information personnelle. Vous pouvez le couper à tout moment.</p>
          <ActionForm action={setFemmePartner} className="space-y-3">
            <input type="hidden" name="enable" value="1" />
            <div className="flex flex-wrap gap-2">{Object.entries(PARTNER_TOPICS).map(([k, v]) => <label key={k} className={F.chip}><input type="checkbox" name="topics" value={k} defaultChecked={profile.partner_topics.includes(k)} className="sr-only" />{v}</label>)}</div>
            <SubmitButton className={F.btnOutline}>{token ? "Mettre à jour les thèmes" : "Créer le lien de partage"}</SubmitButton>
          </ActionForm>
          {token && (
            <div className="space-y-2 rounded-xl bg-[#F8E7EF] p-3 text-sm">
              <p>Lien à envoyer : <span className="select-all break-all font-mono text-xs">{`${SITE_URL}/partage-femme/${token}`}</span></p>
              <ActionForm action={setFemmePartner}><input type="hidden" name="enable" value="0" /><SubmitButton variant="ghost" size="sm" confirm="Couper le partage ? L'ancien lien ne fonctionnera plus.">Couper le partage</SubmitButton></ActionForm>
            </div>
          )}
        </section>
      )}

      <section className={`${F.card} space-y-3`}>
        <h2 className={F.h2}>Mes données</h2>
        <a href="/femme/export" className={F.btnOutline} download><Download className="size-4" aria-hidden /> Télécharger toutes mes données</a>
        <p className="text-xs text-muted-foreground">
          Protection : connexion chiffrée (HTTPS) ; base de données hébergée chiffrée sur disque ; accès limité à votre compte par la base elle-même{notesEncrypted() ? " ; vos notes personnelles sont en plus chiffrées avec une clé secrète du site" : ""}. Les personnes qui gèrent techniquement l&apos;hébergement pourraient y accéder en dehors du site : PharmaProxi ne le fait pas, et aucune page d&apos;administration ne les affiche.
        </p>
        {(log.data ?? []).length > 0 && (
          <details className="text-sm"><summary className="cursor-pointer font-semibold text-[#843653]">Derniers accès sensibles</summary>
            <ul className="mt-2 space-y-0.5 text-xs">{(log.data ?? []).map((l, i) => <li key={i}>{fmt(String(l.at).slice(0, 10), { day: "numeric", month: "short", year: "numeric" })} {String(l.at).slice(11, 16)} — {ACTIONS[l.action] ?? l.action}</li>)}</ul>
          </details>
        )}
        <details className="rounded-xl border border-red-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-red-800">Supprimer définitivement mon espace</summary>
          <ActionForm action={deleteFemmeAll} className="mt-3 space-y-2">
            <p className="text-sm">Toutes vos données (profil, règles, journal, rappels, historique d&apos;accès) seront effacées. Cette action est irréversible. Votre compte PharmaProxi reste actif.</p>
            <label className="block max-w-xs space-y-1 text-sm font-medium">Écrivez SUPPRIMER<input name="confirm" required className={F.input} autoComplete="off" /></label>
            <SubmitButton variant="destructive">Tout supprimer</SubmitButton>
          </ActionForm>
        </details>
      </section>
      <Privacy />
    </div>
  );
}
