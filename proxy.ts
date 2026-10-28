import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { buildCsp, makeNonce } from "@/lib/csp";
import { SUPABASE_URL } from "@/lib/env";

export async function proxy(request: NextRequest) {
  const nonce = makeNonce();
  const csp = buildCsp(nonce, SUPABASE_URL);
  // Next.js lit le jeton dans l'en-tête CSP de la requête et l'applique à ses propres scripts.
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = await updateSession(request, headers);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|icons|sw.js|manifest.webmanifest|.*\\.(?:png|webp|svg|ico|txt|csv)$).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
