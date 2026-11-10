"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEMO_ACTORS, isDemoEnv } from "@/lib/demo";
import { recordLogin } from "@/lib/consents";

/**
 * Connexion en un clic à un compte de démonstration.
 * Refusée hors de l'environnement de démonstration. Elle passe par la connexion normale
 * (même session, mêmes règles d'accès) : aucun contrôle n'est contourné.
 */
export async function demoSignIn(fd: FormData) {
  if (!isDemoEnv()) redirect("/demo");
  const actor = DEMO_ACTORS.find((a) => a.key === String(fd.get("actor") ?? ""));
  const password = process.env.DEMO_PASSWORD;
  if (!actor || !password) redirect("/demo?erreur=1");
  const supabase = await createClient();
  await supabase.auth.signOut().catch(() => {});
  const { error } = await supabase.auth.signInWithPassword({ email: actor.email, password });
  if (error) redirect("/demo?erreur=1");
  await recordLogin(supabase).catch(() => {});
  redirect(actor.start);
}
