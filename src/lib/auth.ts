import "server-only";
import { cache } from "react";
import { redirect, unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { log } from "@/lib/log";

export type Role = "customer" | "pharmacist" | "courier" | "admin";

export type SessionInfo = {
  userId: string;
  email: string | null;
  fullName: string | null;
  roles: Role[];
  unread: number;
  /** Fiche médecin de l'annuaire, si le compte en a une. */
  doctor: { id: string; status: string } | null;
  /** Nombre d'établissements (cliniques) dont le compte est membre. */
  clinics: number;
};

/** Informations de session (mises en cache pour la requête). Les droits réels sont imposés par la RLS. */
export const getSession = cache(async (): Promise<SessionInfo | null> => {
  if (!isSupabaseConfigured()) return null;
  try {
    return await loadSession();
  } catch (e) {
    unstable_rethrow(e); // signaux internes de Next.js (rendu dynamique, redirections)
    // Base injoignable : le site reste consultable en mode visiteur
    log.error("session.load_failed", { message: String((e as Error)?.message ?? e).slice(0, 300) });
    return null;
  }
});

async function loadSession(): Promise<SessionInfo | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: roles }, { data: profile }, { count }, { data: doctor }, { count: clinics }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase.from("profiles").select("full_name, deleted_at").eq("id", user.id).maybeSingle(),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
    supabase.from("doctors").select("id, status").eq("user_id", user.id).maybeSingle(),
    supabase.from("clinic_members").select("clinic_id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  if (profile?.deleted_at) return null;
  return {
    userId: user.id,
    email: user.email ?? null,
    fullName: profile?.full_name ?? null,
    roles: (roles ?? []).map((r) => r.role as Role),
    unread: count ?? 0,
    doctor: doctor ? { id: doctor.id as string, status: doctor.status as string } : null,
    clinics: clinics ?? 0,
  };
}

export async function requireUser(next?: string) {
  const s = await getSession();
  if (!s) redirect(`/connexion${next ? `?suite=${encodeURIComponent(next)}` : ""}`);
  return s;
}

export async function requireRole(role: Role, next?: string) {
  const s = await requireUser(next);
  if (!s.roles.includes(role)) redirect("/acces-refuse");
  return s;
}
