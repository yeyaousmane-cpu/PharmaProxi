"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { fieldErrors, formObject, signInSchema, signUpSchema } from "@/lib/validation";
import { allow, blocked, failure } from "@/lib/limiter";
import { clientIp } from "@/lib/request";
import { safeNext } from "@/lib/redirect";
import { SITE_URL } from "@/lib/env";

export async function signIn(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse(formObject(fd));
  if (!parsed.success) return { error: "Vérifiez le formulaire", fieldErrors: fieldErrors(parsed.error) };
  const ip = await clientIp();
  // Limitation des tentatives échouées : par IP et par compte (fenêtre de 15 minutes)
  const window = 15 * 60_000;
  const keys = [`login:ip:${ip}`, `login:email:${parsed.data.email}`];
  if ((await blocked(keys[0], 20, window)) || (await blocked(keys[1], 8, window))) {
    return { error: "Trop de tentatives de connexion. Patientez 15 minutes." };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    await Promise.all(keys.map((k) => failure(k, window)));
    return { error: humanizeError(error) };
  }
  revalidatePath("/", "layout");
  redirect(safeNext(fd.get("suite"), "/"));
}

export async function signUp(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse(formObject(fd));
  if (!parsed.success) return { error: "Vérifiez le formulaire", fieldErrors: fieldErrors(parsed.error) };
  if (!(await allow(`signup:${await clientIp()}`, 5, 60 * 60_000))) return { error: "Trop d'inscriptions depuis ce réseau. Réessayez plus tard." };
  const supabase = await createClient();
  const next = safeNext(fd.get("suite"), "/");
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name, phone: parsed.data.phone ?? null },
      emailRedirectTo: `${SITE_URL}/auth/callback?suite=${encodeURIComponent(next)}`,
    },
  });
  if (error) return { error: humanizeError(error) };
  if (!data.session) {
    return { ok: true, message: "Compte créé. Confirmez votre adresse grâce au lien envoyé par e-mail, puis connectez-vous." };
  }
  revalidatePath("/", "layout");
  redirect(next);
}

export async function requestPasswordReset(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Adresse e-mail invalide" };
  if (!(await allow(`reset:${await clientIp()}`, 5, 60 * 60_000))) return { error: "Trop de demandes. Réessayez plus tard." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${SITE_URL}/auth/callback?suite=/compte/mot-de-passe` });
  // Réponse identique que le compte existe ou non (pas d'énumération des comptes)
  return { ok: true, message: "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé." };
}

export async function updatePassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const pw = String(fd.get("password") ?? "");
  if (pw.length < 8) return { error: "8 caractères minimum", fieldErrors: { password: "8 caractères minimum" } };
  if (pw !== String(fd.get("confirm") ?? "")) return { error: "Les mots de passe ne correspondent pas" };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) return { error: humanizeError(error) };
  return { ok: true, message: "Mot de passe mis à jour." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
