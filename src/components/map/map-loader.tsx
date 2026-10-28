"use client";
import dynamic from "next/dynamic";
import type { MapPoint } from "@/components/map/pharmacy-map";

const PharmacyMap = dynamic(() => import("@/components/map/pharmacy-map"), {
  ssr: false,
  loading: () => <div className="flex h-[60vh] min-h-[320px] items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground">Chargement de la carte…</div>,
});

export function MapLoader(props: { points: MapPoint[]; center?: [number, number] | null; me?: [number, number] | null }) {
  return <PharmacyMap {...props} />;
}
