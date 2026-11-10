import Link from "next/link";
import { WifiOff } from "lucide-react";
import { RecentList } from "@/components/recent/recent-list";
import { getT } from "@/lib/i18n";

export const metadata = { title: "Hors connexion" };

export default async function Offline() {
  const t = await getT();
  return (
    <div className="container-page py-16 text-center">
      <WifiOff className="mx-auto size-10 text-muted-foreground" aria-hidden />
      <h1 className="mt-4 text-2xl font-bold">{t("off.title")}</h1>
      <p className="mx-auto mt-2 max-w-md text-muted-foreground">{t("off.text")}</p>
      <Link prefetch={false} href="/" className="mt-6 inline-block font-semibold text-primary underline">{t("state.retry")}</Link>
      <div className="mx-auto mt-8 max-w-md rounded-2xl border bg-white p-4 text-start text-sm">
        <p className="font-semibold">{t("off.available")}</p>
        <ul className="mt-2 space-y-1">
          {[["/sos", t("nav.sos")], ["/premiers-secours", t("link.secours")], ["/sante-mentale", t("link.mentale")], ["/prevention", t("link.prevention")], ["/laboratoires/lexique", t("link.lexique")], ["/urgences", t("nav.urgences")], ["/droits", t("link.droits")], ["/don-de-sang", t("link.sang")], ["/amo/guide", t("link.amo_guide")]].map(([h, l]) => (
            <li key={h}><a href={h} className="font-medium text-primary underline">{l}</a></li>
          ))}
        </ul>
      </div>
      <div className="mx-auto mt-10 max-w-4xl"><RecentList title={t("off.recent")} /></div>
    </div>
  );
}
