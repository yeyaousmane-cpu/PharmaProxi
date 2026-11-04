import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SantéProxi",
    short_name: "SantéProxi",
    description: "Pharmacies, médecins, laboratoires et dossier santé au Mali.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F6FAF7",
    theme_color: "#068132",
    lang: "fr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
