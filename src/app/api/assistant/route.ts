import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getSettings } from "@/lib/settings";
import { allow } from "@/lib/limiter";
import { clientIp } from "@/lib/request";
import { log } from "@/lib/log";
import { detectUrgency, urgencyAnswer, sanitizeConversation } from "@/lib/assistant/safety";
import { systemPrompt, type ContextArticle } from "@/lib/assistant/prompt";
import { assistantConfigured, streamAnswer } from "@/lib/assistant/provider";

export const runtime = "nodejs";
export const maxDuration = 60;

const text = (body: string, status = 200, extra: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...extra } });

/**
 * Assistant santé : aucune conversation n'est enregistrée. Seuls des compteurs journaliers anonymes le sont.
 * Ordre : limite par appareil → nettoyage → détection d'urgence (réponse fixe, sans IA) → IA.
 */
export async function POST(req: NextRequest) {
  if (!assistantConfigured()) return text("L'assistant santé sera bientôt disponible.", 503);
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return text("Origine refusée.", 403);

  let body: unknown;
  try { body = await req.json(); } catch { return text("Requête invalide.", 400); }
  const conv = sanitizeConversation((body as { messages?: unknown })?.messages);
  if ("error" in conv) return text(conv.error, 400);

  const ip = await clientIp();
  if (!(await allow(`assistant:${ip}`, Number(process.env.ASSISTANT_HOURLY_LIMIT || 20), 3_600_000)))
    return text("Vous avez posé beaucoup de questions en peu de temps. Réessayez dans une heure. En cas d'urgence, rendez-vous aux urgences.", 429);

  const settings = await getSettings();
  const svc = createServiceClient();
  const last = conv[conv.length - 1].content;
  const urgency = detectUrgency(last);
  if (urgency) {
    await svc?.rpc("assistant_count", { p_kind: "emergency", p_daily_limit: 0 });
    return text(urgencyAnswer(urgency, settings.emergency_numbers ?? null), 200, { "x-assistant": "urgence" });
  }

  if (svc) {
    const { data: ok, error } = await svc.rpc("assistant_count", { p_kind: "ai", p_daily_limit: Number(process.env.ASSISTANT_DAILY_LIMIT || 2000) });
    if (error) log.warn("assistant.count", { error: error.message });
    else if (ok === false) return text("L'assistant a atteint sa limite de questions pour aujourd'hui. Revenez demain, ou demandez conseil à votre pharmacien.", 429);
  }

  // Fiches validées en rapport avec la question (contexte fiable pour l'IA)
  let articles: ContextArticle[] = [];
  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc("health_search", { p_query: last.slice(0, 80), p_limit: 3 });
    articles = ((data ?? []) as ContextArticle[]).map((a) => ({ slug: a.slug, title: a.title, summary: (a.summary ?? "").slice(0, 300) }));
  } catch { /* la recherche de fiches est facultative */ }

  const system = systemPrompt({ emergencyNumbers: settings.emergency_numbers ?? null, articles, today: new Date().toISOString().slice(0, 10) });
  try {
    const stream = await streamAnswer(system, conv, req.signal);
    return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-assistant": "ia" } });
  } catch (e) {
    log.error("assistant.provider", { error: (e as Error).message });
    return text("L'assistant ne répond pas pour le moment. Réessayez dans quelques minutes, ou demandez conseil à votre pharmacien.", 502);
  }
}
