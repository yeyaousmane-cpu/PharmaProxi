import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Kit d'enregistrement audio" };

export default async function AudioKit() {
  const supabase = await createClient();
  const [{ data: targets }, { data: langs }] = await Promise.all([
    supabase.from("audio_targets").select("key, label, page_path, script_fr").order("sort_order").order("label"),
    supabase.from("audio_languages").select("name, native_name").eq("is_active", true).order("sort_order"),
  ]);
  return (
    <article className="mx-auto max-w-3xl space-y-6 bg-white p-6 text-[15px] leading-relaxed print:p-0">
      <header>
        <h1 className="text-2xl font-bold">PharmaProxi — kit d&apos;enregistrement des guides audio</h1>
        <p className="mt-2">Langues : {(langs ?? []).map((l) => l.name).join(", ")}.</p>
      </header>
      <section className="rounded-lg border p-4">
        <h2 className="font-bold">Consignes pour la personne qui enregistre</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Lisez le texte français, puis dites-le dans votre langue, avec des mots simples. Gardez exactement le même sens : n&apos;ajoutez ni ne retirez aucun conseil.</li>
          <li>Enregistrez dans un endroit calme, téléphone à 20 cm de la bouche. Un message vocal WhatsApp convient.</li>
          <li>Parlez lentement. Une page = un enregistrement (moins de 2 minutes).</li>
          <li>Nommez le fichier : langue-page (exemple : bambara-accueil).</li>
          <li>Un second locuteur de la même langue écoute et confirme que le sens est juste.</li>
          <li>Pour les termes médicaux sans équivalent (drépanocytose, rhésus…), dites le mot français puis expliquez-le.</li>
        </ol>
      </section>
      {(targets ?? []).map((t, i) => (
        <section key={t.key} className="break-inside-avoid border-t pt-4">
          <h2 className="font-bold">{i + 1}. {t.label}</h2>
          <p className="text-xs text-muted-foreground">Page {t.page_path} · code {t.key}</p>
          <p className="mt-2 whitespace-pre-line">{t.script_fr}</p>
        </section>
      ))}
      <p className="text-xs text-muted-foreground print:hidden">Pour imprimer ou enregistrer en PDF : menu du navigateur › Imprimer.</p>
    </article>
  );
}
