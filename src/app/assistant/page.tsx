import Link from "next/link";
import { Bot, ShieldAlert, Siren } from "lucide-react";
import { HealthChat } from "@/components/assistant/health-chat";
import { assistantConfigured } from "@/lib/assistant/provider";
import { getSettings } from "@/lib/settings";

export const metadata = {
  title: "Assistant santé",
  description: "Posez vos questions de santé du quotidien : conseils simples, médicaments sans ordonnance, quand consulter.",
};
export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const settings = await getSettings();
  const numbers = settings.emergency_numbers?.trim();
  return (
    <div className="container-page max-w-3xl space-y-4 py-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-[#052D1E]"><Bot className="size-7 text-primary" aria-hidden /> Assistant santé</h1>
        <p className="text-muted-foreground">Une question sur un petit souci de santé ? L&apos;assistant vous répond tout de suite, en français simple, et vous aide à trouver le médicament en pharmacie.</p>
      </header>

      <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
        <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
        <p>
          <strong>L&apos;assistant ne remplace pas un médecin ni un pharmacien.</strong> Il donne des informations générales, ne pose aucun diagnostic
          et ne conseille que des médicaments vendus sans ordonnance. Enfants, femmes enceintes, personnes âgées ou malades chroniques : demandez toujours
          conseil au pharmacien. Les réponses sont produites par une intelligence artificielle et peuvent contenir des erreurs. Vos questions ne sont pas enregistrées.
        </p>
      </div>

      <HealthChat available={assistantConfigured()} />

      <Link prefetch={false} href="/urgences" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-950 hover:border-red-400">
        <Siren className="size-5 shrink-0" aria-hidden />
        <span><strong>Urgence ?</strong> Douleur dans la poitrine, difficulté à respirer, perte de connaissance, convulsions : n&apos;écrivez pas, allez aux urgences{numbers ? ` ou appelez le ${numbers}` : ""}.</span>
      </Link>
    </div>
  );
}
