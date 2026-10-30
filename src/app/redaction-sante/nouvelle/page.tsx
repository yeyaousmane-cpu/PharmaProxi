import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireHealthStaff } from "@/lib/health/staff";
import { ArticleForm } from "@/components/health/article-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Nouvelle fiche santé" };

export default async function NewHealthArticle() {
  await requireHealthStaff("/redaction-sante/nouvelle");
  const supabase = await createClient();
  const { data: cats } = await supabase.from("health_categories").select("id, slug, name").order("sort_order");
  return (
    <div className="space-y-4">
      <Link prefetch={false} href="/redaction-sante" className="text-sm text-[#068132] underline">← Toutes les fiches</Link>
      <Card>
        <CardHeader><CardTitle>Nouvelle fiche (brouillon)</CardTitle></CardHeader>
        <CardContent><ArticleForm categories={cats ?? []} /></CardContent>
      </Card>
    </div>
  );
}
