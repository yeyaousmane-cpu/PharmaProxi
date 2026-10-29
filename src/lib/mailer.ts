import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { log } from "@/lib/log";

/**
 * Envoi d'e-mails par SMTP (Gmail, Zoho, Brevo, hébergeur du domaine…).
 * Variables (Vercel › Settings › Environment Variables, type « Secret ») :
 *   SMTP_HOST (défaut smtp.gmail.com), SMTP_PORT (défaut 465), SMTP_USER, SMTP_PASS, MAIL_FROM (facultatif)
 * Sans SMTP_USER / SMTP_PASS, aucun e-mail n'est envoyé (les notifications du site fonctionnent toujours).
 */
export function isMailConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transport: Transporter | null = null;
function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 465);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10_000,
      socketTimeout: 15_000,
      pool: true,
      maxConnections: 3,
    });
  }
  return transport;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://pharma-proxi.vercel.app").replace(/\/$/, "");

/** Gabarit simple, lisible sur téléphone et dans tous les logiciels de messagerie. */
export function renderEmail({ title, body, link, name }: { title: string; body: string; link?: string | null; name?: string | null }) {
  const url = `${SITE()}${link && link.startsWith("/") ? link : "/"}`;
  const hello = name ? `Bonjour ${name.split(" ")[0]},` : "Bonjour,";
  const paragraphs = body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;line-height:1.55">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f3f6f4;font-family:Arial,Helvetica,sans-serif;color:#052D1E">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6f4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #dde7e1">
<tr><td><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td height="6" style="background:#14B53A;font-size:0">&nbsp;</td><td height="6" style="background:#FCD116;font-size:0">&nbsp;</td><td height="6" style="background:#CE1126;font-size:0">&nbsp;</td></tr></table></td></tr>
<tr><td style="padding:22px 26px 6px;font-size:22px;font-weight:bold;color:#068132">PharmaProxi</td></tr>
<tr><td style="padding:0 26px;font-size:13px;color:#5b6b63">Votre pharmacie, plus proche de vous.</td></tr>
<tr><td style="padding:22px 26px 8px;font-size:15px">
<h1 style="margin:0 0 16px;font-size:20px;color:#052D1E">${esc(title)}</h1>
<p style="margin:0 0 14px">${esc(hello)}</p>${paragraphs}
<p style="margin:22px 0"><a href="${esc(url)}" style="display:inline-block;background:#068132;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px">Ouvrir PharmaProxi</a></p>
</td></tr>
<tr><td style="padding:16px 26px 22px;font-size:12px;color:#6b7b73;border-top:1px solid #eef2ef">
Vous recevez ce message car vous êtes inscrit(e) sur PharmaProxi. Pour toute question : ${esc(SITE())}/infos/contact<br>
PharmaProxi ne pose aucun diagnostic. En cas d'urgence, rendez-vous au service d'urgence le plus proche.</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${title}\n\n${hello}\n\n${body}\n\nOuvrir PharmaProxi : ${url}\n\n—\nVous recevez ce message car vous êtes inscrit(e) sur PharmaProxi.`;
  return { html, text };
}

export async function sendMail({ to, subject, html, text }: { to: string; subject: string; html: string; text: string }) {
  if (!isMailConfigured()) return false;
  try {
    await getTransport().sendMail({
      from: process.env.MAIL_FROM || `PharmaProxi <${process.env.SMTP_USER}>`,
      to, subject, html, text,
    });
    return true;
  } catch (e) {
    log.warn("mail.failed", { error: String((e as Error)?.message ?? e).slice(0, 200) });
    return false;
  }
}

/** Envoi groupé : un e-mail par personne (jamais de liste visible), 3 envois en parallèle. */
export async function sendMany(items: { to: string; subject: string; html: string; text: string }[], deadlineMs = 50_000) {
  const start = Date.now();
  let sent = 0, failed = 0, skipped = 0;
  const ok: number[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      if (Date.now() - start > deadlineMs) { skipped++; continue; }
      if (await sendMail(items[idx])) { sent++; ok.push(idx); } else failed++;
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return { sent, failed, skipped, ok };
}
