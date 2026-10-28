import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NetworkStatus } from "@/components/network-status";
import { getSession } from "@/lib/auth";
import { isSupabaseConfigured, SITE_URL } from "@/lib/env";
import { Alert } from "@/components/ui/alert";
import { FlashToast } from "@/components/flash-toast";
import { readFlash } from "@/lib/flash";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "PharmaProxi — Votre pharmacie, plus proche de vous", template: "%s · PharmaProxi" },
  description: "Trouvez les pharmacies du Mali et les médicaments qu'elles déclarent disponibles, demandez une confirmation et réservez pour un retrait.",
  applicationName: "PharmaProxi",
  manifest: "/manifest.webmanifest",
  icons: { apple: "/icons/apple-touch-icon.png" },
  openGraph: { images: ["/logo.webp"], locale: "fr_ML", siteName: "PharmaProxi" },
};

export const viewport: Viewport = {
  themeColor: "#068132",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [session, flash] = await Promise.all([getSession(), readFlash()]);
  return (
    <html lang="fr">
      <body className="min-h-dvh">
        <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2">
          Aller au contenu
        </a>
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
        <SiteFooter />
        <MobileNav />
        <FlashToast message={flash} />
      </body>
    </html>
  );
}
