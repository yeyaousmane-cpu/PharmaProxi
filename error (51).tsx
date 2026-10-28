"use client";
import { SegmentError } from "@/components/segment-error";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="container-page py-8"><SegmentError error={error} reset={reset} home="/medecin" label="Retour à mon espace" /></div>;
}
