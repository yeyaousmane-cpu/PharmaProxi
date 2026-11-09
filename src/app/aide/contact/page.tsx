import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { createTicket } from "@/app/actions/help";
import { Breadcrumb } from "@/components/help/help-ui";

export const metadata = { title: "Contacter l'équipe — Centre d'aide" };
export const dynamic = "force-dynamic";

export default async function HelpContact({ searchParams }: { searchParams: Promise<{ rubrique?: string }> }) {
  const { rubrique } = await searchParams;
  const supabase = await createClient();
  const [session, { data: cats }] = await Promise.all([
    getSession(),
    supabase.from("help_categories").select("slug,title").eq("active", true).order("sort"),
  ]);
  return (
    <div className="container-page max-w-2xl space-y-6 py-6">
      <Breadcrumb items={[["Centre d'aide", "/aide"], ["Contacter l'équipe", null]]} />
      <h1 className="text-2xl font-extrabold text-[#052D1E]">Contacter l&apos;équipe SantéProxi</h1>
      <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><strong>Urgence médicale ?</strong> Ce formulaire n&apos;est pas suivi en temps réel : ouvrez <Link prefetch={false} href="/sos" className="font-semibold underline">SOS Santé</Link>.</p>
      <p className="text-sm text-muted-foreground">Vous recevez un numéro de suivi. {session ? <>Retrouvez vos demandes et nos réponses dans <Link prefetch={false} href="/compte/aide" className="font-semibold text-[#068132] underline">Mes demandes d&apos;aide</Link>.</> : <>Sans compte, nous vous répondons par e-mail ou par téléphone.</>}</p>
      <ActionForm action={createTicket} className="grid gap-4 rounded-2xl border bg-white p-5" resetOnSuccess>
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
        <Field label="Votre nom" htmlFor="name" required><Input id="name" name="name" maxLength={120} required /></Field>
        {!session && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="E-mail" htmlFor="email"><Input id="email" name="email" type="email" maxLength={200} /></Field>
            <Field label="Téléphone" htmlFor="phone"><Input id="phone" name="phone" inputMode="tel" maxLength={30} /></Field>
          </div>
        )}
        <Field label="Rubrique" htmlFor="category"><Select id="category" name="category" defaultValue={rubrique ?? ""}>
          <option value="">Autre / je ne sais pas</option>{((cats as { slug: string; title: string }[] | null) ?? []).map((c) => <option key={c.slug} value={c.slug}>{c.title}</option>)}</Select></Field>
        <Field label="Objet" htmlFor="subject" required><Input id="subject" name="subject" maxLength={160} required /></Field>
        <Field label="Votre message" htmlFor="body" required><Textarea id="body" name="body" rows={5} maxLength={5000} required placeholder="Décrivez votre question. N'indiquez pas d'informations médicales détaillées." /></Field>
        <div><SubmitButton>Envoyer ma demande</SubmitButton></div>
      </ActionForm>
    </div>
  );
}
