"use client";
import { useActionState } from "react";
import { confirmTotpEnroll, startTotpEnroll } from "@/app/actions/security";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/errors";

type D = { factorId: string; qr: string; secret: string };

export function TotpEnroll() {
  const [start, startAction, starting] = useActionState(startTotpEnroll, {} as ActionState);
  const [conf, confAction, confirming] = useActionState(confirmTotpEnroll, {} as ActionState);
  const d = ((conf.data ?? start.data) as D | undefined) ?? null;
  if (conf.ok) return <Alert tone="success" title={conf.message ?? "Activée."} />;
  if (!d) {
    return (
      <form action={startAction} className="space-y-2">
        {start.error && <Alert tone="error" title={start.error} />}
        <Button type="submit" disabled={starting}>{starting ? "Préparation…" : "Activer la double authentification"}</Button>
      </form>
    );
  }
  return (
    <form action={confAction} className="space-y-3">
      <input type="hidden" name="factor_id" value={d.factorId} /><input type="hidden" name="qr" value={d.qr} /><input type="hidden" name="secret" value={d.secret} />
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>Installez une application d&apos;authentification gratuite sur votre téléphone (Google Authenticator, Microsoft Authenticator…).</li>
        <li>Dans l&apos;application, ajoutez un compte en scannant ce code :</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={d.qr} alt="QR code à scanner avec l'application d'authentification" className="size-48 rounded-lg border bg-white p-2" />
      <p className="text-xs text-muted-foreground">Impossible de scanner ? Saisissez cette clé dans l&apos;application : <code className="break-all font-mono">{d.secret}</code></p>
      <label className="block text-sm font-medium">3. Saisissez le code à 6 chiffres affiché
        <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required className="mt-1 block h-12 w-40 rounded-xl border px-3 text-center text-xl tracking-widest" />
      </label>
      {conf.error && <Alert tone="error" title={conf.error} />}
      <Button type="submit" disabled={confirming}>{confirming ? "Vérification…" : "Confirmer"}</Button>
    </form>
  );
}
