import { Building2, HeartPulse, Phone, ShieldAlert, ShieldCheck, Siren, Ambulance, Flame, LifeBuoy } from "lucide-react";
import { CopyNumber } from "./copy-number";
import { formatDate } from "@/lib/format";

export type EmergencyContact = {
  id: string; name: string; mission: string | null; phone: string; phone_alt: string | null;
  tier: "principal" | "complementaire"; icon: string; status: "a_verifier" | "verifie" | "a_actualiser";
  source_url: string | null; verified_at: string | null;
};

const ICONS: Record<string, typeof Phone> = {
  sante: HeartPulse, protection_civile: Flame, police: ShieldCheck, gendarmerie: ShieldAlert,
  crise: Siren, garde: Building2, ambulance: Ambulance, autre: LifeBuoy,
};

/** Affichage lisible : 8 chiffres groupés par deux, numéros courts tels quels. */
export function displayNumber(n: string) {
  const d = n.replace(/\s+/g, "");
  return /^\d{8}$/.test(d) ? d.replace(/(\d{2})(?=\d)/g, "$1 ") : d;
}
/** Lien d'appel : les numéros à 8 chiffres reçoivent l'indicatif du Mali, les numéros courts restent tels quels. */
export function telHref(n: string, country = "ML") {
  const d = n.replace(/\s+/g, "");
  if (d.startsWith("+")) return `tel:${d}`;
  return country === "ML" && /^\d{8}$/.test(d) ? `tel:+223${d}` : `tel:${d}`;
}

function StatusNote({ c }: { c: EmergencyContact }) {
  const src = c.source_url ? <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="underline">source officielle</a> : null;
  if (c.status === "verifie") return <p className="text-xs text-[#068132]">Vérifié{c.verified_at ? ` le ${formatDate(c.verified_at)}` : ""}{src && <> · {src}</>}</p>;
  return <p className="text-xs text-muted-foreground">{c.status === "a_actualiser" ? "Numéro en cours d'actualisation" : "Vérification auprès des autorités en cours"}{src && <> · {src}</>}</p>;
}

function NumberRow({ n, name }: { n: string; name: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={telHref(n)} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#068132] px-4 text-lg font-bold text-white shadow-sm hover:bg-[#052D1E] sm:flex-none"
        aria-label={`Appeler ${name} au ${displayNumber(n)}`}>
        <Phone className="size-5" aria-hidden /> Appeler maintenant
      </a>
      <CopyNumber value={n.replace(/\s+/g, "")} label={`${name} ${displayNumber(n)}`} />
    </div>
  );
}

export function EmergencyNumbers({ contacts }: { contacts: EmergencyContact[] }) {
  const main = contacts.filter((c) => c.tier === "principal");
  const other = contacts.filter((c) => c.tier === "complementaire");
  return (
    <section className="space-y-4" aria-labelledby="numeros-urgence">
      <h2 id="numeros-urgence" className="text-xl font-extrabold text-[#052D1E]">Numéros d&apos;urgence au Mali</h2>
      <ul className="grid gap-3 sm:grid-cols-2">{main.map((c) => {
        const Icon = ICONS[c.icon] ?? LifeBuoy;
        return (
          <li key={c.id} className="flex flex-col gap-3 rounded-2xl border-2 border-[#068132]/20 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#EAF6EE] text-[#068132]"><Icon className="size-6" aria-hidden /></span>
              <div className="min-w-0">
                <p className="text-4xl font-extrabold tracking-wide text-[#052D1E]">{displayNumber(c.phone)}</p>
                <h3 className="font-bold text-[#052D1E]">{c.name}</h3>
                {c.mission && <p className="text-sm text-muted-foreground">{c.mission}</p>}
              </div>
            </div>
            <NumberRow n={c.phone} name={c.name} />
            <StatusNote c={c} />
          </li>);
      })}</ul>

      {other.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-[#052D1E]">Autres contacts utiles</h2>
          <ul className="divide-y rounded-2xl border bg-white">{other.map((c) => {
            const Icon = ICONS[c.icon] ?? LifeBuoy;
            return (
              <li key={c.id} className="space-y-2 p-4">
                <p className="flex items-center gap-2 font-bold text-[#052D1E]"><Icon className="size-5 text-[#1D5FA8]" aria-hidden />{c.name}</p>
                {[c.phone, c.phone_alt].filter((n): n is string => !!n).map((n) => (
                  <div key={n} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-2xl font-bold tracking-wide text-[#052D1E]">{displayNumber(n)}</span>
                    <NumberRow n={n} name={c.name} />
                  </div>))}
                <StatusNote c={c} />
              </li>);
          })}</ul>
        </div>
      )}
    </section>
  );
}
