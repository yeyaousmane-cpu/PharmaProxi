import { Mic } from "lucide-react";
import { getT } from "@/lib/i18n";
import { VoiceAssistant } from "@/components/speech/voice-assistant";

export const metadata = { title: "Parler à SantéProxi", description: "Dites ou écrivez ce que vous cherchez : pharmacie, médecin, rendez-vous, laboratoire, urgences." };

export default async function Page() {
  const t = await getT();
  return (
    <div className="container-page max-w-3xl space-y-4 py-6">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-extrabold text-[#052D1E]"><Mic className="size-8 text-[#068132]" aria-hidden /> {t("speak.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("speak.sub")}</p>
      </header>
      <VoiceAssistant />
    </div>
  );
}
