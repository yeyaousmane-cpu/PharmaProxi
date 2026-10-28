"use client";
import * as React from "react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import type { ActionState } from "@/lib/errors";

/** Bouton d'envoi avec état de chargement (désactivé pendant l'envoi : pas de double soumission). */
export function SubmitButton({ children, pendingText, confirm, onClick, ...props }: ButtonProps & { pendingText?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) return setSlow(false);
    const t = setTimeout(() => setSlow(true), 12_000);
    return () => clearTimeout(t);
  }, [pending]);
  return (
    <>
    <Button
      type="submit"
      {...props}
      disabled={pending || props.disabled}
      aria-busy={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
        onClick?.(e);
      }}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {pending ? pendingText ?? "Envoi…" : children}
    </Button>
    {slow ? (
      <p role="status" className="mt-1 text-xs text-amber-800">
        La réponse tarde (connexion lente ?). Vous pouvez{" "}
        <button type="button" className="font-semibold underline" onClick={() => window.location.reload()}>recharger la page</button>{" "}
        pour vérifier : l&apos;opération ne sera pas enregistrée deux fois.
      </p>
    ) : null}
    </>
  );
}

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Formulaire relié à une Server Action. Affiche les erreurs (globales et par champ)
 * et un message de succès. Fonctionne aussi sans JavaScript (amélioration progressive).
 */
export function ActionForm({
  action, children, className, labels = {}, resetOnSuccess = false, id,
}: { action: Action; children: React.ReactNode; className?: string; labels?: Record<string, string>; resetOnSuccess?: boolean; id?: string }) {
  const [state, formAction] = useActionState(action, {} as ActionState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
    // Marque les champs invalides pour les lecteurs d'écran
    const form = ref.current;
    if (!form) return;
    form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
    for (const name of Object.keys(state.fieldErrors ?? {})) {
      form.querySelector(`[name="${CSS.escape(name)}"]`)?.setAttribute("aria-invalid", "true");
    }
  }, [state, resetOnSuccess]);
  const fe = Object.entries(state.fieldErrors ?? {});
  return (
    <form ref={ref} action={formAction} className={className} id={id} noValidate={false}>
      {state.error ? (
        <Alert tone="error" title={state.error} className="mb-3">
          {fe.length ? (
            <ul className="list-disc pl-4">
              {fe.map(([k, v]) => (
                <li key={k}>{labels[k] ? `${labels[k]} : ` : ""}{v}</li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}
      {state.ok && state.message ? <Alert tone="success" title={state.message} className="mb-3" /> : null}
      {children}
    </form>
  );
}
