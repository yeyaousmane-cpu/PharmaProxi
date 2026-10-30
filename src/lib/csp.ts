/**
 * Politique de sécurité du contenu (CSP) avec jeton (« nonce ») par requête :
 * seuls les scripts émis par l'application, porteurs du jeton, s'exécutent ;
 * les scripts qu'ils chargent eux-mêmes sont autorisés via 'strict-dynamic'.
 * Un script injecté (XSS) n'a pas le jeton et est bloqué par le navigateur.
 */
export function buildCsp(nonce: string, supabaseUrl: string, dev = process.env.NODE_ENV === "development") {
  let origin = "";
  try {
    origin = new URL(supabaseUrl).origin;
  } catch {}
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
    "font-src 'self' data:",
    `media-src 'self' ${origin}`.trim(),
    `connect-src 'self' ${origin}`.trim(),
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export function makeNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
