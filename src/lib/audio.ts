/** Guides audio : formats acceptés et adresse publique des fichiers (bucket « audio-guides »). */
export const AUDIO_MIME: Record<string, string> = {
  mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", webm: "audio/webm", wav: "audio/wav",
};
export const AUDIO_MAX_BYTES = 4 * 1024 * 1024; // limite d'envoi d'un formulaire sur Vercel : 4,5 Mo

/** Vérifie un fichier déposé ; renvoie le type MIME retenu et l'extension, ou un message d'erreur. */
export function checkAudioFile(name: string, size: number, type: string): { mime: string; ext: string } | { error: string } {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  const mime = AUDIO_MIME[ext];
  if (!mime) return { error: "Format non accepté : utilisez MP3, M4A, AAC, OGG, OPUS, WEBM ou WAV." };
  if (type && !type.startsWith("audio/") && !(type === "video/mp4" && ext === "m4a") && type !== "application/octet-stream") return { error: "Ce fichier n'est pas un enregistrement audio." };
  if (size <= 0) return { error: "Fichier vide." };
  if (size > AUDIO_MAX_BYTES) return { error: "4 Mo maximum : enregistrez en MP3 ou en message vocal WhatsApp (2 minutes ≈ 1 Mo)." };
  return { mime, ext };
}

export function audioPublicUrl(path: string) {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/audio-guides/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export const formatDuration = (s: number | null) => (s ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s` : null);
