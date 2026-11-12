import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Chiffrement des fichiers de santé (résultats d'analyses, documents personnels) : AES-256-GCM
 * avec la clé secrète du serveur (FEMME_ENCRYPTION_KEY, 32 octets en base64). Le fichier stocké
 * est illisible sans cette clé ; il n'est jamais transmis à un service d'intelligence artificielle.
 * Sans clé configurée, l'envoi est refusé : aucun fichier de santé n'est stocké en clair.
 */
function key(): Buffer | null {
  const k = process.env.FEMME_ENCRYPTION_KEY;
  if (!k) return null;
  const b = Buffer.from(k, "base64");
  return b.length === 32 ? b : null;
}
export const filesEncryptionReady = () => key() !== null;

const MAGIC = Buffer.from("SPF1");
export function sealFile(data: Buffer): Buffer {
  const k = key();
  if (!k) throw new Error("Le chiffrement des fichiers n'est pas configuré sur le serveur.");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([c.update(data), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), ct]);
}
export function openFile(stored: Buffer): Buffer {
  const k = key();
  if (!k) throw new Error("Clé de chiffrement indisponible.");
  if (!stored.subarray(0, 4).equals(MAGIC)) throw new Error("Fichier inconnu.");
  const d = createDecipheriv("aes-256-gcm", k, stored.subarray(4, 16));
  d.setAuthTag(stored.subarray(16, 32));
  return Buffer.concat([d.update(stored.subarray(32)), d.final()]);
}

export const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
/** L'hébergement (Vercel) refuse les requêtes de plus de 4,5 Mo : la limite affichée est la limite réelle. */
export const MAX_FILE = 4 * 1024 * 1024;
export const MAX_FILE_LABEL = "4 Mo";

/** Fichier DICOM : préambule de 128 octets puis « DICM ». */
export const isDicom = (b: Buffer) => b.length > 132 && b.subarray(128, 132).toString("latin1") === "DICM";

/** Vérifie le type réel du fichier d'après ses premiers octets (et pas seulement son extension). */
export function sniffMime(b: Buffer): (typeof ALLOWED_MIME)[number] | null {
  if (b.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}
