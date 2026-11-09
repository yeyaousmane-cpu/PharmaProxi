import { Fragment, type ReactNode } from "react";

/** Gras **x** et italique *x*, sans aucun HTML injecté. */
function inline(text: string, mark?: RegExp | null): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0; let m: RegExpExecArray | null; let k = 0;
  const push = (s: string) => out.push(<Fragment key={k++}>{highlight(s, mark)}</Fragment>);
  while ((m = re.exec(text))) {
    if (m.index > last) push(text.slice(last, m.index));
    out.push(m[1] ? <strong key={k++}>{highlight(m[1], mark)}</strong> : <em key={k++}>{highlight(m[2], mark)}</em>);
    last = re.lastIndex;
  }
  if (last < text.length) push(text.slice(last));
  return out;
}

export function highlight(text: string, mark?: RegExp | null): ReactNode {
  if (!mark) return text;
  const parts = text.split(mark);
  return parts.map((p, i) => (i % 2 === 1 ? <mark key={i} className="rounded bg-[#EAF6EE] px-0.5 text-[#052D1E]">{p}</mark> : p));
}

/** Expression de surlignage tolérante aux accents à partir d'une recherche. */
export function markFor(q: string | undefined): RegExp | null {
  const words = (q ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/).filter((w) => w.length >= 3).slice(0, 5);
  if (!words.length) return null;
  const acc: Record<string, string> = { a: "[aàâä]", e: "[eéèêë]", i: "[iîï]", o: "[oôö]", u: "[uùûü]", c: "[cç]" };
  const pat = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").split("").map((ch) => acc[ch] ?? ch).join("")).join("|");
  return new RegExp(`(${pat})`, "gi");
}

/** Rendu des articles d'aide : titres « ## », listes « - » et « 1. », gras, italique. */
export function HelpMarkdown({ text, q }: { text: string; q?: string }) {
  const mark = markFor(q);
  const blocks = text.replace(/\r/g, "").trim().split(/\n{2,}/);
  return (
    <div className="space-y-4 text-[1.05rem] leading-relaxed">
      {blocks.map((b, i) => {
        const lines = b.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.every((l) => l.startsWith("- "))) return <ul key={i} className="list-disc space-y-1.5 pl-6">{lines.map((l, j) => <li key={j}>{inline(l.slice(2), mark)}</li>)}</ul>;
        if (lines.every((l) => /^\d+\.\s/.test(l))) return (
          <ol key={i} className="space-y-2">{lines.map((l, j) => (
            <li key={j} className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#068132] text-sm font-bold text-white">{j + 1}</span>
              <span className="pt-0.5">{inline(l.replace(/^\d+\.\s/, ""), mark)}</span></li>))}</ol>);
        if (b.startsWith("## ")) return <h2 key={i} className="text-xl font-bold text-[#052D1E]">{b.slice(3)}</h2>;
        return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{inline(l, mark)}{j < lines.length - 1 ? <br /> : null}</Fragment>)}</p>;
      })}
    </div>
  );
}
