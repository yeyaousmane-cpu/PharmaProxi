import { AlertTriangle, Ban, CheckCircle2, Inbox, Loader2, ServerCrash, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

export type UiState = "loading" | "success" | "error" | "empty" | "forbidden" | "unavailable" | "offline";
const STYLE: Record<UiState, { Icon: typeof Inbox; tone: string; role: "status" | "alert" }> = {
  loading: { Icon: Loader2, tone: "bg-muted/50 text-muted-foreground", role: "status" },
  success: { Icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-900", role: "status" },
  error: { Icon: AlertTriangle, tone: "bg-red-50 text-red-900", role: "alert" },
  empty: { Icon: Inbox, tone: "border bg-white text-muted-foreground", role: "status" },
  forbidden: { Icon: Ban, tone: "bg-amber-50 text-amber-900", role: "alert" },
  unavailable: { Icon: ServerCrash, tone: "bg-amber-50 text-amber-900", role: "alert" },
  offline: { Icon: WifiOff, tone: "bg-amber-50 text-amber-900", role: "alert" },
};

/** Message d'état uniforme : chargement, succès, erreur, aucun résultat, accès refusé, service indisponible, hors connexion. */
export function StateMessage({ state, children, className, action }: { state: UiState; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  const { Icon, tone, role } = STYLE[state];
  return (
    <div role={role} data-state={state} className={cn("flex items-start gap-3 rounded-xl p-4 text-sm", tone, className)}>
      <Icon className={cn("mt-0.5 size-5 shrink-0", state === "loading" && "animate-spin")} aria-hidden />
      <div className="space-y-2"><div>{children}</div>{action}</div>
    </div>
  );
}
