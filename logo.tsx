import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link prefetch={false} href="/" className={cn("flex items-center gap-2", className)} aria-label="PharmaProxi — accueil">
      <Image src="/emblem.webp" alt="" width={40} height={40} priority className="h-9 w-9 sm:h-10 sm:w-10" />
      {!compact && (
        <span className="text-xl font-extrabold tracking-tight">
          <span className="text-brand-deep">Pharma</span>
          <span className="text-brand-green">Proxi</span>
        </span>
      )}
    </Link>
  );
}
