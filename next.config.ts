import type { NextConfig } from "next";

// La politique CSP (avec jeton par requête) est posée par src/proxy.ts.

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  async redirects() {
    // Module de livraison retiré (v052) : les anciens liens renvoient vers l'explication du service.
    return [
      { source: "/livraison", destination: "/fonctionnement", permanent: true },
      { source: "/livraison/:path*", destination: "/fonctionnement", permanent: true },
      { source: "/admin/livreurs", destination: "/admin", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        ],
      },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};

export default nextConfig;
