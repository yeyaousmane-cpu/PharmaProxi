/** Rendu minimal et sûr (aucun HTML injecté) : paragraphes et listes « - ». */
export function SimpleMarkdown({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  return (
    <div className="space-y-3 leading-relaxed">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => l.trim().startsWith("- "))) {
          return <ul key={i} className="list-disc space-y-1 pl-5">{lines.map((l, j) => <li key={j}>{l.trim().slice(2)}</li>)}</ul>;
        }
        if (b.startsWith("## ")) return <h2 key={i} className="text-lg font-bold">{b.slice(3)}</h2>;
        return <p key={i}>{lines.map((l, j) => <span key={j}>{l}{j < lines.length - 1 ? <br /> : null}</span>)}</p>;
      })}
    </div>
  );
}
