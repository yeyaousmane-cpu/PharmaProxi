import { createClient } from "@/lib/supabase/server";
import { LICENSE, guard, json, options } from "@/lib/public-api";

export const OPTIONS = options;
export async function GET() {
  const limited = await guard("exams"); if (limited) return limited;
  const supabase = await createClient();
  const { data, error } = await supabase.from("medical_exams").select("id, code, name, category, description").eq("is_active", true).order("category").order("name");
  if (error) return json({ error: "Service momentanément indisponible." }, 502);
  return json({ license: LICENSE, data: data ?? [] }, 200, 3600);
}
