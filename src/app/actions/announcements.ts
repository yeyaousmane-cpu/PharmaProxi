"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { requireRole } from "@/lib/auth";
import { isMailConfigured, renderEmail, sendMany } from "@/lib/mailer";

const schema = z.object({
  title: z.string().trim().min(3, "Titre : 3 caractères minimum").max(120),
  body: z.string().trim().min(10, "Message : 10 caractères minimum").max(3000),
  link: z.string().trim().max(200).regex(/^(\/[A-Za-z0-9/_?=&#%.-]*)?$/, "Lien interne commençant par / (ex. /garde)").optional(),
  audience: z.enum(["tous", "clients", "pharmaciens", "medecins", "etablissements", "livreurs"]),
  kind: z.enum(["announcement", "welcome"]),
});
type Recipient = { id: string; email: string; name: string | null };

export async function sendAnnouncement(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireRole("admin", "/admin/annonces");
  const parsed = schema.safeParse(Object.fromEntries(["title", "body", "link", "audience", "kind"].map((k) => [k, String(fd.get(k) ?? "")])));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const wantEmail = fd.get("email") === "on";
  if (wantEmail && !isMailConfigured()) {
    return { error: "L'envoi d'e-mails n'est pas encore configuré (SMTP_USER et SMTP_PASS dans Vercel). Décochez « Envoyer aussi par e-mail » ou configurez-le d'abord." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_send_announcement", {
    p_title: v.title, p_body: v.body, p_link: v.link || null, p_audience: v.audience, p_email: wantEmail, p_kind: v.kind,
  });
  if (error) return { error: humanizeError(error) };
  const res = data as { id: string; count: number; recipients: Recipient[] };
  let mailInfo = "";
  if (wantEmail) {
    const list = res.recipients.slice(0, 400); // Gmail : 500 envois par jour au maximum
    const out = await sendMany(list.map((r) => {
      const { html, text } = renderEmail({ title: v.title, body: v.body, link: v.link, name: r.name });
      return { to: r.email, subject: v.title, html, text };
    }));
    const welcomed = v.kind === "welcome" ? out.ok.map((i) => list[i].id) : [];
    await supabase.rpc("admin_announcement_email_result", { p_id: res.id, p_sent: out.sent, p_failed: out.failed + out.skipped, p_welcomed: welcomed });
    mailInfo = ` E-mails : ${out.sent} envoyé(s)${out.failed ? `, ${out.failed} en échec` : ""}${out.skipped || res.recipients.length > list.length ? ` — renvoyez l'annonce plus tard pour les ${out.skipped + res.recipients.length - list.length} restant(s)` : ""}.`;
    if (v.kind === "welcome" && res.recipients.length === 0) mailInfo = " E-mails : tout le monde a déjà reçu l'e-mail de bienvenue.";
  }
  revalidatePath("/admin/annonces");
  return { ok: true, message: `Annonce envoyée : ${res.count} notification(s) dans les comptes.${mailInfo}` };
}
