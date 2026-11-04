import { MessageSquareHeart } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Select, Textarea } from "@/components/ui/input";
import { submitFeedback } from "@/app/actions/authorities";

export const metadata = { title: "Donner mon avis", description: "Dites-nous ce qui marche, ce qui ne marche pas et ce qui manque sur PharmaProxi." };

export default async function Avis({ searchParams }: { searchParams: Promise<{ depuis?: string }> }) {
  const sp = await searchParams;
  const from = sp.depuis?.startsWith("/") && !sp.depuis.startsWith("//") ? sp.depuis.slice(0, 200) : "";
  return (
    <div className="container-page max-w-xl space-y-4 py-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><MessageSquareHeart className="size-7 text-primary" aria-hidden /> Donner mon avis</h1>
      <p className="text-muted-foreground">Votre avis nous aide à rendre PharmaProxi plus simple et plus utile. Il est lu par l&apos;équipe. Ne donnez pas d&apos;information sur votre santé ici.</p>
      <section className="rounded-2xl border bg-white p-5">
        <ActionForm action={submitFeedback} className="space-y-4" resetOnSuccess>
          <input type="hidden" name="page" value={from} />
          <fieldset><legend className="mb-2 text-sm font-semibold">Comment trouvez-vous PharmaProxi ?</legend>
            <div className="flex gap-3">{[["content", "😊", "Content"], ["moyen", "😐", "Moyen"], ["pas_content", "🙁", "Pas content"]].map(([v, e, l]) => (
              <label key={v} className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border px-4 py-3 has-[:checked]:border-primary has-[:checked]:bg-brand-mint">
                <input type="radio" name="mood" value={v} className="sr-only" /><span className="text-3xl" aria-hidden>{e}</span><span className="text-sm">{l}</span></label>))}</div>
          </fieldset>
          <Field label="C'est à propos de" htmlFor="cat"><Select id="cat" name="category" defaultValue="autre">
            <option value="difficile">C&apos;est difficile à utiliser</option><option value="bug">Quelque chose ne marche pas</option><option value="contenu">Une information est fausse ou manque</option><option value="idee">J&apos;ai une idée</option><option value="autre">Autre</option></Select></Field>
          <Field label="Votre message (facultatif)" htmlFor="msg"><Textarea id="msg" name="message" rows={4} maxLength={1000} /></Field>
          <SubmitButton>Envoyer mon avis</SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}
