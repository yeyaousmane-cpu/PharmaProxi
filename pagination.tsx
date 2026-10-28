import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { PAGE_SIZE } from "@/lib/paging";
export { PAGE_SIZE, pageRange } from "@/lib/paging";

/** Pagination « Précédent / Suivant » conservant les autres filtres de l'URL. */
export function Pagination({ basePath, params, page, total, size = PAGE_SIZE }: {
  basePath: string; params: Record<string, string | undefined>; page: number; total: number | null; size?: number;
}) {
  const pages = Math.max(1, Math.ceil((total ?? 0) / size));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-center gap-3 text-sm">
      {page > 1 ? <Link prefetch={false} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={href(page - 1)}>Précédent</Link> : null}
      <span>Page {Math.min(page, pages)} / {pages} · {total} élément(s)</span>
      {page < pages ? <Link prefetch={false} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={href(page + 1)}>Suivant</Link> : null}
    </nav>
  );
}
