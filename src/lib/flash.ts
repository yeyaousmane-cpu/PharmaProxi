import "server-only";
import { cookies } from "next/headers";

export const FLASH_COOKIE = "pp_flash";

/**
 * Message de confirmation qui survit au nouveau rendu de la page : utile quand
 * le bouton qui a déclenché l'action disparaît (ex. statut de commande changé).
 */
export async function setFlash(message: string) {
  (await cookies()).set(FLASH_COOKIE, encodeURIComponent(message.slice(0, 200)), {
    path: "/", maxAge: 60, sameSite: "lax", httpOnly: false, secure: process.env.NODE_ENV === "production",
  });
}

export async function readFlash(): Promise<string | null> {
  const raw = (await cookies()).get(FLASH_COOKIE)?.value;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}
