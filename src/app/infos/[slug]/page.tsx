import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SimpleMarkdown } from "@/components/simple-markdown";
import { formatDate } from "@/lib/format";
import { ContactForm } from "@/components/contact-form";
import { getSession } from "@/lib/auth";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("content_pages").select("title").eq("slug", slug).maybeSingle();
  return { title: data?.title ?? "Information" };
}

export default async function InfoPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ sujet?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("content_pages").select("title, body, updated_at").eq("slug", slug).eq("published", true).maybeSingle();
  if (!data) notFound();
  return (
    <article className="container-page max-w-3xl py-8">
      <h1 className="text-2xl font-bold">{data.title}</h1>
      <p className="mb-6 text-xs text-muted-foreground">Mis à jour le {formatDate(data.updated_at)}</p>
      <SimpleMarkdown text={data.body} />
      {slug === "contact" && <ContactSection topic={sp.sujet} />}
    </article>
  );
}

async function ContactSection({ topic }: { topic?: string }) {
  const session = await getSession();
  let defaults: { name?: string | null; email?: string | null; phone?: string | null; topic?: string } = { topic };
  if (session) {
    const supabase = await createClient();
    const { data } = await supabase.from("profiles").select("full_name, phone").eq("id", session.userId).maybeSingle();
    defaults = { topic, name: data?.full_name, phone: data?.phone, email: session.email };
  }
  return (
    <section id="formulaire" aria-labelledby="contact-form-title" className="mt-8 rounded-2xl border bg-white p-5">
      <h2 id="contact-form-title" className="mb-4 text-lg font-bold">Écrire à PharmaProxi</h2>
      <ContactForm defaults={defaults} />
    </section>
  );
}
