/** Découpage sûr du texte de l'assistant : gras et liens uniquement (internes ou https). Aucun HTML. */
export type Inline = { t: "text"; v: string } | { t: "bold"; v: string } | { t: "link"; v: string; href: string; external: boolean };

export function safeHref(href: string): { href: string; external: boolean } | null {
  const h = href.trim();
  if (/^\/(?!\/)[A-Za-z0-9/_?=&#%.,+-]*$/.test(h)) return { href: h, external: false };
  if (/^https:\/\/[A-Za-z0-9.-]+(\/[^\s<>"']*)?$/.test(h)) return { href: h, external: true };
  return null;
}

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]{1,200})\]\(([^)\s]{1,500})\)/g;
  let last = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push({ t: "text", v: s.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "bold", v: m[1] });
    else {
      const ok = safeHref(m[3]);
      out.push(ok ? { t: "link", v: m[2], ...ok } : { t: "text", v: m[2] });
    }
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ t: "text", v: s.slice(last) });
  return out;
}

export type Block = { t: "p"; lines: string[] } | { t: "ul"; items: string[] } | { t: "ol"; items: string[] };

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.replace(/^#{1,6}\s+/, "").trimEnd();
    const prev = blocks[blocks.length - 1];
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*\d{1,2}[.)]\s+(.*)$/);
    if (!line.trim()) { blocks.push({ t: "p", lines: [] }); continue; }
    if (ul) { if (prev?.t === "ul") prev.items.push(ul[1]); else blocks.push({ t: "ul", items: [ul[1]] }); continue; }
    if (ol) { if (prev?.t === "ol") prev.items.push(ol[1]); else blocks.push({ t: "ol", items: [ol[1]] }); continue; }
    if (prev?.t === "p" && prev.lines.length) prev.lines.push(line); else blocks.push({ t: "p", lines: [line] });
  }
  return blocks.filter((b) => b.t !== "p" || b.lines.length);
}
