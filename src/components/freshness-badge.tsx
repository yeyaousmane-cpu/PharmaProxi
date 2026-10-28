import { Clock } from "lucide-react";
import { FRESHNESS, type Freshness } from "@/lib/freshness";
import { formatAge, formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function FreshnessBadge({ freshness, updatedAt, showDate = true }: { freshness: Freshness; updatedAt?: string; showDate?: boolean }) {
  const f = FRESHNESS[freshness];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge className={cn(f.className)} title={f.hint}>{f.label}</Badge>
      {showDate && updatedAt ? (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={formatDateTime(updatedAt)}>
          <Clock className="size-3" aria-hidden /> Mis à jour {formatAge(updatedAt)} ({formatDateTime(updatedAt)})
        </span>
      ) : null}
    </div>
  );
}
