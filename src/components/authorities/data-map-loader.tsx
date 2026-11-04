"use client";
import dynamic from "next/dynamic";
import type { DataPoint } from "@/components/authorities/data-map";

const DataMap = dynamic(() => import("@/components/authorities/data-map"), {
  ssr: false,
  loading: () => <div className="flex h-[65vh] min-h-[360px] items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground">Chargement de la carte…</div>,
});
export function DataMapLoader({ points }: { points: DataPoint[] }) {
  return <DataMap points={points} />;
}
