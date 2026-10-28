/**
 * Journalisation structurée (une ligne JSON par événement), lisible dans les
 * journaux de Vercel ou de tout hébergeur. Aucune donnée personnelle ne doit
 * être passée dans `data` (pas d'e-mail, de téléphone ni de contenu de commande).
 */
type Level = "info" | "warn" | "error";

function write(level: Level, event: string, data?: Record<string, unknown>) {
  const line = JSON.stringify({ level, event, at: new Date().toISOString(), ...data });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, data?: Record<string, unknown>) => write("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => write("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => write("error", event, data),
};

/** Référence courte à communiquer au support pour retrouver une erreur dans les journaux. */
export function errorRef() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
