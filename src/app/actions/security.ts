"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { allow } from "@/lib/limiter";
import { clientIp } from "@/lib/request";

const safe = (p: string) => (p.startsWith("/") && !p.startsWith("//") ? p : "/");

export async function signOutIdle(path: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/connexion?raison=inactivite&suite=${encodeURIComponent(safe(path))}`);
}

/** Étape 1 : créer le facteur (application d'authentification) et renvoyer le QR code à scanner. */
export async function startTotpEnroll(_: ActionState): Promise<ActionState> {
  const supabase = await createClient();
  const { data: list } = await supabase.auth.mfa.listFactors();
  for (const f of list?.all ?? []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `SantéProxi ${new Date().toISOString().slice(0, 10)}` });
  if (error) return { error: humanizeError(error) };
  return { ok: true, data: { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret } };
}

/** Étape 2 : vérifier le premier code pour activer la double authentification. */
export async function confirmTotpEnroll(_: ActionState, fd: FormData): Promise<ActionState> {
  const factorId = String(fd.get("factor_id") ?? ""), code = String(fd.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "Le code contient 6 chiffres.", data: { factorId, qr: String(fd.get("qr") ?? ""), secret: String(fd.get("secret") ?? "") } };
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: "Code incorrect. Vérifiez l'heure de votre téléphone et réessayez.", data: { factorId, qr: String(fd.get("qr") ?? ""), secret: String(fd.get("secret") ?? "") } };
  revalidatePath("/compte/securite");
  return { ok: true, message: "Double authentification activée. Un code vous sera demandé à chaque connexion." };
}

export async function removeTotp(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") return { error: "Confirmez d'abord votre identité avec un code." };
  const { error } = await supabase.auth.mfa.unenroll({ factorId: String(fd.get("factor_id") ?? "") });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/compte/securite");
  return { ok: true, message: "Double authentification retirée." };
}

/** Connexion : vérifier le code à 6 chiffres. */
export async function verifyLoginCode(_: ActionState, fd: FormData): Promise<ActionState> {
  if (!(await allow(`mfa:${await clientIp()}`, 10, 15 * 60_000))) return { error: "Trop d'essais. Patientez 15 minutes." };
  const code = String(fd.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "Le code contient 6 chiffres." };
  const supabase = await createClient();
  const { data: list } = await supabase.auth.mfa.listFactors();
  const f = list?.totp?.find((x) => x.status === "verified");
  if (!f) redirect(safe(String(fd.get("suite") ?? "/")));
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: f.id, code });
  if (error) return { error: "Code incorrect." };
  revalidatePath("/", "layout");
  redirect(safe(String(fd.get("suite") ?? "/")));
}
