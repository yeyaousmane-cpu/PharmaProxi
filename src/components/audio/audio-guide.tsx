import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { audioPublicUrl, formatDuration } from "@/lib/audio";
import { AudioPlayer, type Clip } from "./audio-player";

type Row = { lang: string; storage_path: string; duration_s: number | null; speaker: string | null; audio_languages: { name: string; native_name: string | null; sort_order: number } | { name: string; native_name: string | null; sort_order: number }[] | null };

/** Guide audio d'une page : n'apparaît que lorsqu'au moins un enregistrement vérifié est publié. */
export async function AudioGuide({ target, label = "Écouter cette page", className }: { target: string; label?: string; className?: string }) {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("audio_clips")
    .select("lang, storage_path, duration_s, speaker, audio_languages(name, native_name, sort_order)")
    .eq("target_key", target).eq("status", "published");
  const rows = ((data as Row[]) ?? []).map((r) => ({ ...r, l: Array.isArray(r.audio_languages) ? r.audio_languages[0] : r.audio_languages }))
    .filter((r) => r.l).sort((a, b) => a.l!.sort_order - b.l!.sort_order);
  if (rows.length === 0) return null;
  const clips: Clip[] = rows.map((r) => ({ lang: r.lang, name: r.l!.name, native: r.l!.native_name, url: audioPublicUrl(r.storage_path), duration: formatDuration(r.duration_s), speaker: r.speaker }));
  return <div className={className}><AudioPlayer clips={clips} label={label} /></div>;
}
