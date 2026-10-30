import Link from "next/link";
import { parseBlocks, parseInline } from "@/lib/assistant/markdown";

function InlineText({ s }: { s: string }) {
  return (
    <>
      {parseInline(s).map((p, i) =>
        p.t === "bold" ? <strong key={i}>{p.v}</strong>
        : p.t === "link" ? (p.external
          ? <a key={i} href={p.href} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-primary underline">{p.v}</a>
          : <Link key={i} prefetch={false} href={p.href} className="font-semibold text-primary underline">{p.v}</Link>)
        : <span key={i}>{p.v}</span>,
      )}
    </>
  );
}

export function ChatMarkdown({ text }: { text: string }) {
  return (
    <div className="space-y-2 leading-relaxed [overflow-wrap:anywhere]">
      {parseBlocks(text).map((b, i) =>
        b.t === "p" ? <p key={i}>{b.lines.map((l, j) => <span key={j}><InlineText s={l} />{j < b.lines.length - 1 && <br />}</span>)}</p>
        : b.t === "ul" ? <ul key={i} className="list-disc space-y-1 pl-5">{b.items.map((it, j) => <li key={j}><InlineText s={it} /></li>)}</ul>
        : <ol key={i} className="list-decimal space-y-1 pl-5">{b.items.map((it, j) => <li key={j}><InlineText s={it} /></li>)}</ol>,
      )}
    </div>
  );
}
