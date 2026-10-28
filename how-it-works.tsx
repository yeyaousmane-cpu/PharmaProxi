import { CalendarCheck, MapPin, PhoneCall, Search } from "lucide-react";

const steps = [
  { Icon: Search, title: "Recherchez", text: "Tapez le nom commercial ou le principe actif du médicament." },
  { Icon: MapPin, title: "Comparez", text: "Voyez les pharmacies qui le déclarent, leur distance, leur prix et la date de mise à jour du stock." },
  { Icon: PhoneCall, title: "Faites confirmer", text: "Appelez la pharmacie ou envoyez une demande : elle confirme la disponibilité réelle." },
  { Icon: CalendarCheck, title: "Retirez", text: "Une fois confirmé, le produit vous est réservé. Retirez-le en pharmacie (livraison selon autorisation)." },
];

export function HowItWorks() {
  return (
    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map(({ Icon, title, text }, i) => (
        <li key={title} className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-brand-mint text-sm font-bold text-brand-green">{i + 1}</span>
            <Icon className="size-5 text-brand-green" aria-hidden />
          </div>
          <h3 className="mt-3 font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{text}</p>
        </li>
      ))}
    </ol>
  );
}
