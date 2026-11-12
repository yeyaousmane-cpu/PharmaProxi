import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NetworkStatus } from "@/components/network-status";
import { isDemoEnv } from "@/lib/demo";
import { getSession } from "@/lib/auth";
import { isSupabaseConfigured, SITE_URL } from "@/lib/env";
import { Alert } from "@/components/ui/alert";
import { FlashToast } from "@/components/flash-toast";
import { readFlash } from "@/lib/flash";
import { isSimpleMode } from "@/lib/simple-mode";
import { getMessages, getT, htmlLangDir } from "@/lib/i18n";
import { I18nProvider } from "@/i18n/client";
import { POSITIONING } from "@/lib/brand";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "SantéProxi — La santé, plus proche de vous", template: "%s · SantéProxi" },
  description: POSITIONING,
  applicationName: "SantéProxi",
  manifest: "/manifest.webmanifest",
  icons: { apple: "/icons/apple-touch-icon.png" },
  openGraph: { images: ["/logo-santeproxi.webp"], locale: "fr_ML", siteName: "SantéProxi" },
};

export const viewport: Viewport = {
  themeColor: "#068132",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [session, flash, simple, ld, { messages }, t] = await Promise.all([getSession(), readFlash(), isSimpleMode(), htmlLangDir(), getMessages(), getT()]);
  return (
    <html lang={ld.lang} dir={ld.dir} className={simple ? "simple" : undefined}>
      <body className="min-h-dvh">
        <I18nProvider lang={ld.lang} messages={messages}>
        <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2">
          {t("nav.skip")}
        </a>
        {isDemoEnv() && <div role="note" className="bg-amber-400 px-4 py-1.5 text-center text-sm font-semibold text-amber-950">Environnement de démonstration — données fictives, aucun e-mail ni message envoyé · <a href="/demo" className="underline">Changer de profil</a></div>}
        <SiteHeader session={session} />
        <NetworkStatus />
        {!isSupabaseConfigured() && (
          <div className="container-page mt-4">
            <Alert tone="warning" title="Configuration incomplète">
              Les variables NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY ne sont pas définies. Consultez le README.
            </Alert>
          </div>
        )}
        <main id="contenu" className="pb-20 md:pb-0">{children}</main>
        <SiteFooter simple={simple} />
        <MobileNav />
        <FlashToast message={flash} />
        </I18nProvider>
      </body>
    </html>
  );
}
