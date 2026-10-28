import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SimpleMarkdown } from "@/components/simple-markdown";
import { formatDate } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("content_pages").select("title").eq("slug", slug).maybeSingle();
  return { title: data?.title ?? "Information" };
}

export default async function InfoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("content_pages").select("title, body, updated_at").eq("slug", slug).eq("published", true).maybeSingle();
  if (!data) notFound();
  return (
    <article className="container-page max-w-3xl py-8">
      <h1 className="text-2xl font-bold">{data.title}</h1>
      <p className="mb-6 text-xs text-muted-foreground">Mis à jour le {formatDate(data.updated_at)}</p>
      <SimpleMarkdown text={data.body} />
    </article>
  );
}
