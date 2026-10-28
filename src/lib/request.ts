import "server-only";
import { headers } from "next/headers";

/** Adresse IP approximative du client (pour la limitation de débit). */
export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
}

