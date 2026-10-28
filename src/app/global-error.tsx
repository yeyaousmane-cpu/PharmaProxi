"use client";

/** Dernier recours : erreur dans la mise en page racine elle-même. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center", color: "#052d1e" }}>
        <h1>PharmaProxi est momentanément indisponible</h1>
        <p>Réessayez dans un instant. En cas d&apos;urgence médicale, contactez directement une pharmacie ou les services d&apos;urgence.</p>
        <button onClick={reset} style={{ padding: "10px 16px", borderRadius: 8, background: "#068132", color: "#fff", border: 0, fontWeight: 600 }}>Réessayer</button>
      </body>
    </html>
  );
}
