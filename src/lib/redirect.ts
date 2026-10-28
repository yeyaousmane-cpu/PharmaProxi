/** N'autorise que les redirections internes (évite les redirections ouvertes). */
export function safeNext(next: unknown, fallback = "/") {
  const s = typeof next === "string" ? next : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : fallback;
}
