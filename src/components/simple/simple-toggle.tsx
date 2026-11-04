import { setSimpleMode } from "@/app/actions/authorities";

/** Bouton pour activer ou quitter le mode simple (grands boutons, texte plus gros). */
export function SimpleToggle({ on, back = "/", className }: { on: boolean; back?: string; className?: string }) {
  return (
    <form action={setSimpleMode} className={className}>
      <input type="hidden" name="on" value={on ? "0" : "1"} /><input type="hidden" name="back" value={back} />
      <button className="rounded-full border bg-white px-4 py-2 text-sm font-semibold text-brand-deep hover:border-primary">{on ? "Revenir au site complet" : "Mode simple : grands boutons"}</button>
    </form>
  );
}
