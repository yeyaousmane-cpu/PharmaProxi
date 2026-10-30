import "server-only";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type HealthStaff = { userId: string; isAdmin: boolean; editor: boolean; validator: boolean; displayName: string | null };

/** Accès à l'espace de rédaction : administrateur, rédacteur ou validateur médical. */
export async function requireHealthStaff(next = "/redaction-sante"): Promise<HealthStaff> {
  const s = await requireUser(next);
  const supabase = await createClient();
  const { data } = await supabase.from("health_staff").select("role, display_name").eq("user_id", s.userId);
  const roles = (data ?? []) as { role: string; display_name: string }[];
  const isAdmin = s.roles.includes("admin");
  if (!isAdmin && roles.length === 0) redirect("/acces-refuse");
  return {
    userId: s.userId, isAdmin,
    editor: isAdmin || roles.some((r) => r.role === "editor"),
    validator: roles.some((r) => r.role === "validator"),
    displayName: roles.find((r) => r.role === "validator")?.display_name ?? roles[0]?.display_name ?? s.fullName,
  };
}
