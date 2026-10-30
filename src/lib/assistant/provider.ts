import "server-only";
import type { ChatMessage } from "./safety";

/**
 * Appel au modèle Claude (API Anthropic) en flux continu.
 * Variables : ANTHROPIC_API_KEY (secrète), ASSISTANT_MODEL (facultatif, défaut « claude-sonnet-5-5 »).
 * ASSISTANT_PROVIDER=fake : réponses factices pour les tests (refusé en production).
 */
export function assistantConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY) || fakeAllowed();
}
const fakeAllowed = () => process.env.ASSISTANT_PROVIDER === "fake" && process.env.APP_ENV !== "production" && process.env.VERCEL_ENV !== "production";

export async function streamAnswer(system: string, messages: ChatMessage[], signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  const enc = new TextEncoder();
  if (fakeAllowed()) {
    const last = messages[messages.length - 1].content;
    const text = `Réponse de test à : « ${last.slice(0, 60)} ». Le **paracétamol** (ex. Doliprane) peut soulager une douleur ; respectez la notice.\n\n👉 [Trouver du paracétamol près de chez moi](/recherche?q=paracetamol)`;
    return new ReadableStream({
      async start(c) {
        for (const part of text.match(/.{1,12}/gs) ?? []) { c.enqueue(enc.encode(part)); await new Promise((r) => setTimeout(r, 15)); }
        c.close();
      },
    });
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.ASSISTANT_MODEL || "claude-sonnet-5-5", max_tokens: 1024, system, messages, stream: true }),
  });
  if (!res.ok || !res.body) throw new Error(`assistant_http_${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  return new ReadableStream({
    // Lit jusqu'à obtenir du texte : un morceau du flux peut ne contenir qu'une ligne incomplète.
    async pull(c) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) { c.close(); return; }
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        let sent = false;
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          let ev: { type?: string; delta?: { type?: string; text?: string } };
          try { ev = JSON.parse(line.slice(5)); } catch { continue; }
          if (ev.type === "error") { c.error(new Error("assistant_stream_error")); return; }
          if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) { c.enqueue(enc.encode(ev.delta.text)); sent = true; }
        }
        if (sent) return;
      }
    },
    cancel() { reader.cancel().catch(() => {}); },
  });
}
