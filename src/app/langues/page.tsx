import { Languages } from "lucide-react";
import { getT } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { LANGUAGES, type Lang } from "@/i18n/core";
import { DeviceCheck } from "@/components/speech/device-check";

export const metadata = { title: "Langues, écoute et voix", description: "Langues réellement disponibles sur SantéProxi : interface, lecture audio, commande vocale et messages enregistrés." };
export const revalidate = 600;

/** Correspondance entre langues d'interface et langues des enregistrements audio. */
const AUDIO_CODE: Partial<Record<Lang, string>> = { fr: "francais", bm: "bambara", snk: "soninke", ff: "peul", son: "songhai" };

export default async function Page() {
  const t = await getT();
  let audio: { code: string; name: string; native_name: string | null; n: number }[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const [{ data: langs }, { data: clips }] = await Promise.all([
      supabase.from("audio_languages").select("code, name, native_name, sort_order").eq("is_active", true).order("sort_order"),
      supabase.from("audio_clips").select("lang").eq("status", "published"),
    ]);
    audio = (langs ?? []).map((l) => ({ code: l.code as string, name: l.name as string, native_name: l.native_name as string | null, n: (clips ?? []).filter((c) => c.lang === l.code).length }));
  }
  const nRec = (l: Lang) => audio.find((a) => a.code === AUDIO_CODE[l])?.n ?? 0;
  const uiStatus = (l: Lang) => LANGUAGES[l].ui === "complete" ? t("langs.full") : t("langs.validated_only");
  return (
    <div className="container-page max-w-4xl space-y-6 py-6">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-extrabold text-[#052D1E]"><Languages className="size-8 text-[#068132]" aria-hidden /> {t("langs.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("langs.sub")}</p>
      </header>
      <div className="overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b text-start text-xs text-muted-foreground">
            <th className="p-3 text-start">{t("lang.label")}</th><th className="p-3 text-start">{t("langs.ui")}</th><th className="p-3 text-start">{t("langs.listen")}</th>
            <th className="p-3 text-start">{t("langs.speak")}</th><th className="p-3 text-start">{t("langs.recorded")}</th>
          </tr></thead>
          <tbody>
            {(Object.keys(LANGUAGES) as Lang[]).map((l) => (
              <tr key={l} className="border-b last:border-0">
                <td className="p-3 font-semibold" lang={l}><span dir="ltr" className="me-2 font-mono text-xs text-muted-foreground">{LANGUAGES[l].short}</span>{LANGUAGES[l].label}</td>
                <td className="p-3">{uiStatus(l)}</td>
                <td className="p-3">{["fr", "en", "ar"].includes(l) ? <DeviceCheck kind="tts" lang={l} /> : <span className="text-muted-foreground">{t("langs.none")}</span>}</td>
                <td className="p-3">{["fr", "en", "ar"].includes(l) ? <DeviceCheck kind="stt" lang={l} /> : <span className="text-muted-foreground">{t("langs.none")}</span>}</td>
                <td className="p-3">{AUDIO_CODE[l] ? t("langs.n_recorded", { n: nRec(l) }) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {audio.length > 0 && (
        <section className="rounded-2xl border bg-white p-4">
          <h2 className="font-bold">{t("langs.recorded")}</h2>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {audio.map((a) => <li key={a.code}><span className="font-medium">{a.name}</span>{a.native_name ? <span className="text-muted-foreground"> ({a.native_name})</span> : null} — {t("langs.n_recorded", { n: a.n })}</li>)}
          </ul>
        </section>
      )}
      <div className="space-y-2 rounded-2xl bg-muted/50 p-4 text-sm">
        <p>{t("langs.note_tts")}</p><p>{t("langs.note_african")}</p><p>{t("langs.note_translation")}</p>
      </div>
    </div>
  );
}
