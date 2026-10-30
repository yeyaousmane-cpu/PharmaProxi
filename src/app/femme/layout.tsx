import { Flower2, Lock } from "lucide-react";
import { FemmeNav } from "@/components/femme/femme-nav";
import { femmeStatus } from "@/lib/femme/server";
import { lockFemme } from "@/app/actions/femme";

export const dynamic = "force-dynamic";

export default async function FemmeLayout({ children }: { children: React.ReactNode }) {
  const st = await femmeStatus();
  const open = st.enabled && !st.locked;
  const discreet = Boolean(st.discreet);
  return (
    <div className="min-h-[70vh] bg-[#FFF9FB] text-[#29232A]">
      <div className="container-page max-w-4xl space-y-4 py-5">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#F8E7EF] text-[#D96A91]"><Flower2 className="size-6" aria-hidden /></span>
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight text-[#843653]">{discreet ? "Mon espace" : "PharmaProxi Femme"}</p>
            {!discreet && <p className="text-xs text-[#843653]/80">Votre corps, votre santé, votre équilibre.</p>}
          </div>
          {open && st.has_pin && (
            <form action={lockFemme} className="ml-auto">
              <button className="flex items-center gap-1.5 rounded-full border border-[#D96A91]/40 bg-white px-3 py-1.5 text-sm font-semibold text-[#843653] hover:bg-[#F8E7EF]"><Lock className="size-4" aria-hidden /> Verrouiller</button>
            </form>
          )}
        </div>
        {open && (
          <FemmeNav items={[
            { href: "/femme", label: "Accueil" }, { href: "/femme/calendrier", label: "Calendrier" }, { href: "/femme/journal", label: "Journal" },
            { href: "/femme/grossesse", label: "Grossesse" }, { href: "/femme/rappels", label: "Rappels" },
            { href: "/femme/bibliotheque", label: "Bibliothèque" }, { href: "/femme/reglages", label: "Réglages" },
          ]} />
        )}
        {children}
      </div>
    </div>
  );
}
