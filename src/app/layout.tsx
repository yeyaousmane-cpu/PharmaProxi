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
import { isSimpleMode } from "@/lib/simple-mode";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "SantéProxi — Toute la santé, près de chez vous", template: "%s · SantéProxi" },
  description: "Le point d'accès numérique à la santé au Mali : pharmacies et médicaments, médecins et rendez-vous, laboratoires et prix des analyses, urgences, dossier santé personnel.",
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
  const [session, flash, simple] = await Promise.all([getSession(), readFlash(), isSimpleMode()]);
  return (
    <html lang="fr" className={simple ? "simple" : undefined}>
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
        <SiteFooter simple={simple} />
        <MobileNav />
        <FlashToast message={flash} />
      </body>
    </html>
  );
}
