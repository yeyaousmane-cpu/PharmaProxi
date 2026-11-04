import "server-only";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Membre des autorités (ou administrateur) ; null sinon. */
export async function authorityContext(path: string) {
  const s = await requireUser(path);
  const supabase = await createClient();
  const { data } = await supabase.from("authority_members").select("scope, organisation, title, active").eq("user_id", s.userId).maybeSingle();
  const admin = s.roles.includes("admin");
  if (!admin && !(data?.active)) return { ok: false as const, supabase };
  return { ok: true as const, supabase, admin, scope: (data?.active ? data.scope : "admin") as string, organisation: data?.active ? data.organisation : "Administration PharmaProxi" };
}
