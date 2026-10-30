import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Chiffrement des notes personnelles (AES-256-GCM) avec la clé secrète FEMME_ENCRYPTION_KEY
 * (32 octets en base64, uniquement sur le serveur). Sans clé, les notes sont stockées en clair
 * (protégées seulement par les droits d'accès et le chiffrement du disque de Supabase).
 */
function key(): Buffer | null {
  const k = process.env.FEMME_ENCRYPTION_KEY;
  if (!k) return null;
  const b = Buffer.from(k, "base64");
  return b.length === 32 ? b : null;
}
export const notesEncrypted = () => key() !== null;

export function sealNote(text: string | null): string | null {
  if (!text) return null;
  const k = key();
  if (!k) return text;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return `v1:${Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64")}`;
}

export function openNote(stored: string | null): string | null {
  if (!stored) return null;
  if (!stored.startsWith("v1:")) return stored;
  const k = key();
  if (!k) return "(note chiffrée : clé indisponible)";
  try {
    const raw = Buffer.from(stored.slice(3), "base64");
    const d = createDecipheriv("aes-256-gcm", k, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return "(note illisible)";
  }
}
