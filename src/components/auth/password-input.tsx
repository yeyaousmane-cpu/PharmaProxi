"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/** Évaluation simple et explicable de la robustesse (aucun envoi du mot de passe). */
export function passwordScore(pw: string) {
  const checks = [pw.length >= 8, pw.length >= 12, /[a-z]/.test(pw) && /[A-Z]/.test(pw), /\d/.test(pw), /[^A-Za-z0-9]/.test(pw)];
  const common = /^(?:12345678|password|motdepasse|azerty|qwerty|00000000|11111111)/i.test(pw);
  return common ? 0 : checks.filter(Boolean).length;
}

const LEVELS = [["Trop faible", "bg-red-600", "w-1/5"], ["Faible", "bg-red-500", "w-2/5"], ["Moyen", "bg-amber-500", "w-3/5"], ["Bon", "bg-[#02A934]", "w-4/5"], ["Très bon", "bg-[#068132]", "w-full"]];

export function PasswordInput({ id, name, autoComplete, meter = false, required = true, minLength }: { id: string; name: string; autoComplete: string; meter?: boolean; required?: boolean; minLength?: number }) {
  const [shown, setShown] = useState(false);
  const [value, setValue] = useState("");
  const s = passwordScore(value);
  const [label, color, width] = LEVELS[Math.max(0, s - 1)] ?? LEVELS[0];
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <input id={id} name={name} type={shown ? "text" : "password"} autoComplete={autoComplete} required={required} minLength={minLength} maxLength={72}
          value={value} onChange={(e) => setValue(e.target.value)} aria-describedby={meter ? `${id}-meter` : undefined}
          className="flex h-11 w-full rounded-md border border-input bg-background px-3 pe-12 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <button type="button" onClick={() => setShown((v) => !v)} aria-label={shown ? "Masquer le mot de passe" : "Afficher le mot de passe"} aria-pressed={shown}
          className="absolute end-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground">
          {shown ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
        </button>
      </div>
      {meter && (
        <div id={`${id}-meter`} aria-live="polite" className="space-y-1">
          <div className="h-1.5 w-full rounded-full bg-muted"><div className={`h-1.5 rounded-full transition-all ${value ? `${color} ${width}` : "w-0"}`} /></div>
          <p className="text-xs text-muted-foreground">{value ? <>Robustesse : <strong>{label}</strong>. </> : null}8 caractères minimum ; idéalement 12, avec majuscules, minuscules, chiffres et symboles. Évitez votre date de naissance ou votre numéro.</p>
        </div>
      )}
    </div>
  );
}
