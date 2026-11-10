import Link from "next/link";
import { Building2, CalendarDays, CircleHelp, FileLock2, FlaskConical, HeartPulse, Hospital, MessageCircle, Pill, Search, ShieldCheck, Siren, Smartphone, Stethoscope, UserRound, Users, Video, Wallet } from "lucide-react";

export const HELP_ICONS: Record<string, typeof CircleHelp> = {
  user: UserRound, calendar: CalendarDays, pill: Pill, flask: FlaskConical, "file-lock": FileLock2, users: Users, video: Video,
  hospital: Hospital, siren: Siren, shield: ShieldCheck, wallet: Wallet, smartphone: Smartphone, stethoscope: Stethoscope, building: Building2, help: CircleHelp, heart: HeartPulse,
};

export type HelpCategory = { slug: string; title: string; description: string; icon: string; audience: string };
export type HelpArticleRow = { slug: string; title: string; summary: string; category_slug: string; section: string };

export const NO_RESULT = "Nous n'avons pas trouvé de réponse à votre recherche. Essayez d'autres mots-clés ou contactez notre équipe.";

export function HelpSearch({ q = "", large = false }: { q?: string; large?: boolean }) {
  return (
    <form action="/aide/recherche" role="search" className="relative">
      <label htmlFor="help-q" className="sr-only">Rechercher dans l&apos;aide</label>
      <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-[#068132]" aria-hidden />
      <input id="help-q" name="q" defaultValue={q} list="help-suggestions" autoComplete="off" maxLength={100}
        placeholder="Votre question (ex. rendez-vous)"
        className={`w-full rounded-2xl border-2 border-[#068132]/30 bg-white ps-12 pe-28 text-[#052D1E] shadow-sm outline-none focus:border-[#068132] ${large ? "h-14 text-lg" : "h-12"}`} />
      <button className="absolute end-2 top-1/2 -translate-y-1/2 rounded-xl bg-[#068132] px-4 py-2 font-semibold text-white hover:bg-[#052D1E]">Chercher</button>
    </form>
  );
}

export function Breadcrumb({ items }: { items: [string, string | null][] }) {
  return (
    <nav aria-label="Fil d'Ariane" className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">{items.map(([label, href], i) => (
        <li key={i} className="flex items-center gap-1">{i > 0 && <span aria-hidden>›</span>}{href ? <Link prefetch={false} href={href} className="hover:underline">{label}</Link> : <span className="text-[#052D1E]">{label}</span>}</li>))}</ol>
    </nav>
  );
}

export function ContactCta() {
  return (
    <section className="flex flex-col items-start gap-3 rounded-2xl bg-[#052D1E] p-6 text-white sm:flex-row sm:items-center">
      <MessageCircle className="size-10 shrink-0 text-[#9CCBAE]" aria-hidden />
      <div className="flex-1"><p className="text-lg font-bold">Vous n&apos;avez pas trouvé votre réponse ?</p><p className="text-white/80">Écrivez à l&apos;équipe SantéProxi : vous recevez un numéro de suivi.</p></div>
      <Link prefetch={false} href="/aide/contact" className="inline-flex min-h-11 items-center rounded-xl bg-white px-5 font-semibold text-[#052D1E] hover:bg-[#EAF6EE]">Contacter l&apos;équipe</Link>
    </section>
  );
}
