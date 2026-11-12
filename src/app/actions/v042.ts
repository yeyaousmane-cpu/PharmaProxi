"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { requireUser } from "@/lib/auth";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function saveProgramNational(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("/admin/prevention");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_prevention_program", { p_slug: str(fd, "slug"), p_national: str(fd, "national") || null, p_url: str(fd, "url") || null });
  if (error) return { error: humanizeError(error) };
  revalidatePath(`/prevention/programmes/${str(fd, "slug")}`); revalidatePath("/admin/prevention");
  return { ok: true, message: "Programme national enregistré avec sa source." };
}

export async function linkToProgram(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("/admin/prevention");
  const id = z.uuid().safeParse(fd.get("id")); const kind = str(fd, "kind");
  if (!id.success || !["event", "article"].includes(kind)) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_link_prevention", { p_kind: kind, p_id: id.data, p_program: str(fd, "program") || null });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/admin/prevention"); revalidatePath("/prevention/programmes", "layout");
  return { ok: true, message: "Rattachement enregistré." };
}
