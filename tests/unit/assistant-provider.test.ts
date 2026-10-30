import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

const sse = (events: object[], split = 7) => {
  const raw = events.map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join("");
  const enc = new TextEncoder();
  return new ReadableStream({ start(c) { for (let i = 0; i < raw.length; i += split) c.enqueue(enc.encode(raw.slice(i, i + split))); c.close(); } });
};
const read = async (s: ReadableStream<Uint8Array>) => { const r = await new Response(s).text(); return r; };

describe("assistant : appel à l'API Anthropic", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("envoie la clé côté serveur et reconstitue le texte du flux, même découpé", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    vi.stubEnv("ASSISTANT_PROVIDER", "");
    const fetchMock = vi.fn(async () => new Response(sse([
      { type: "message_start" },
      { type: "content_block_delta", delta: { type: "text_delta", text: "Le **paracétamol** " } },
      { type: "content_block_delta", delta: { type: "text_delta", text: "soulage." } },
      { type: "message_stop" },
    ])));
    vi.stubGlobal("fetch", fetchMock);
    const { streamAnswer } = await import("@/lib/assistant/provider");
    const out = await read(await streamAnswer("sys", [{ role: "user", content: "mal de tête" }]));
    expect(out).toBe("Le **paracétamol** soulage.");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("sk-test");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ stream: true, system: "sys", messages: [{ role: "user", content: "mal de tête" }] });
  });

  it("signale une erreur HTTP", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 401 })));
    const { streamAnswer } = await import("@/lib/assistant/provider");
    await expect(streamAnswer("s", [{ role: "user", content: "x" }])).rejects.toThrow("assistant_http_401");
  });

  it("refuse le mode factice en production", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ASSISTANT_PROVIDER", "fake");
    vi.stubEnv("VERCEL_ENV", "production");
    const { assistantConfigured } = await import("@/lib/assistant/provider");
    expect(assistantConfigured()).toBe(false);
  });
});
