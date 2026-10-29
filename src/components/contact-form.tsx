import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { sendContactMessage } from "@/app/actions/contact";

export const CONTACT_TOPICS: Record<string, string> = {
  question: "Question sur le service", erreur: "Signaler une information erronée", donnees: "Mes données personnelles",
  pharmacie: "Je suis pharmacien", medecin: "Je suis médecin, clinique ou laboratoire", partenariat: "Partenariat, presse, institution", autre: "Autre",
};

export function ContactForm({ defaults }: { defaults?: { name?: string | null; email?: string | null; phone?: string | null; topic?: string } }) {
  return (
    <ActionForm action={sendContactMessage} resetOnSuccess className="grid gap-4 sm:grid-cols-2"
      labels={{ topic: "Sujet", name: "Nom", email: "E-mail", phone: "Téléphone", message: "Message" }}>
      <Field label="Sujet" htmlFor="c-topic" required>
        <Select id="c-topic" name="topic" defaultValue={defaults?.topic && CONTACT_TOPICS[defaults.topic] ? defaults.topic : "question"} required>
          {Object.entries(CONTACT_TOPICS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </Field>
      <Field label="Nom" htmlFor="c-name" required><Input id="c-name" name="name" defaultValue={defaults?.name ?? ""} required maxLength={120} autoComplete="name" /></Field>
      <Field label="E-mail" htmlFor="c-email"><Input id="c-email" name="email" type="email" defaultValue={defaults?.email ?? ""} maxLength={200} autoComplete="email" /></Field>
      <Field label="Téléphone" htmlFor="c-phone" hint="E-mail ou téléphone : au moins l'un des deux"><Input id="c-phone" name="phone" type="tel" defaultValue={defaults?.phone ?? ""} maxLength={30} autoComplete="tel" /></Field>
      <div className="sm:col-span-2">
        <Field label="Message" htmlFor="c-message" required hint="Ne mentionnez pas d'informations médicales personnelles (symptômes, diagnostic, ordonnance).">
          <Textarea id="c-message" name="message" rows={6} required minLength={10} maxLength={3000} />
        </Field>
      </div>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      <div className="sm:col-span-2"><SubmitButton pendingText="Envoi…">Envoyer le message</SubmitButton></div>
    </ActionForm>
  );
}
