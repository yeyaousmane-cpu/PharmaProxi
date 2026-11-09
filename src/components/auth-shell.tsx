import Image from "next/image";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bogolan min-h-[70vh] py-10">
      <div className="container-page max-w-md">
        <div className="rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
          <Image src="/logo-santeproxi-sans-slogan.webp" alt="SantéProxi — La santé, plus proche de vous." width={640} height={444} className="mx-auto h-auto w-40" priority />
          <h1 className="mt-2 text-center text-2xl font-bold">{title}</h1>
          {subtitle ? <p className="mt-1 text-center text-sm text-muted-foreground">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
