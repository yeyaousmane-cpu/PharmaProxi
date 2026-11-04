import { getSession } from "@/lib/auth";

/** Contenu destiné aux professionnels : masqué pour un patient connecté (visible pour les visiteurs et les professionnels). */
export async function ProOnly({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (s && s.accountType === "patient" && !s.roles.some((r) => r === "pharmacist" || r === "admin") && !s.doctor && s.clinics === 0 && s.labs === 0) return null;
  return <>{children}</>;
}
