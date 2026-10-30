/**
 * Calculs pédagogiques (exécutés dans le navigateur, rien n'est enregistré ni envoyé).
 * Modèle mendélien simple : un gène, deux allèles par parent, transmission indépendante à chaque grossesse.
 * Ce ne sont pas des diagnostics : les profils réels se déterminent par un examen de laboratoire.
 */

// ---------------------------------------------------------------------------
// Hémoglobine : allèles A (normal), S (drépanocytaire), C (hémoglobine C)
// ---------------------------------------------------------------------------
export type HbProfile = "AA" | "AS" | "AC" | "SS" | "SC" | "CC";
export const HB_PROFILES: HbProfile[] = ["AA", "AS", "AC", "SS", "SC", "CC"];

export const HB_LABEL: Record<HbProfile, { title: string; text: string; tone: "ok" | "carrier" | "disease" }> = {
  AA: { title: "AA — hémoglobine habituelle", text: "Pas de gène S ni C transmis par ce parent.", tone: "ok" },
  AS: { title: "AS — porteur du trait drépanocytaire", text: "La personne n'est généralement pas malade, mais peut transmettre le gène S.", tone: "carrier" },
  AC: { title: "AC — porteur de l'hémoglobine C", text: "La personne n'est généralement pas malade, mais peut transmettre le gène C.", tone: "carrier" },
  SS: { title: "SS — drépanocytose (forme SS)", text: "Forme de drépanocytose qui nécessite un suivi médical régulier.", tone: "disease" },
  SC: { title: "SC — drépanocytose (forme SC)", text: "Forme de drépanocytose, souvent moins sévère que SS mais qui nécessite un suivi médical.", tone: "disease" },
  CC: { title: "CC — hémoglobinose C", text: "Forme généralement modérée (anémie possible) ; avis médical recommandé.", tone: "disease" },
};

const order = (a: string, b: string) => (["A", "S", "C"].indexOf(a) <= ["A", "S", "C"].indexOf(b) ? a + b : b + a) as HbProfile;

/** Probabilités théoriques, pour chaque grossesse, des profils de l'enfant (en %). */
export function hbOffspring(p1: HbProfile, p2: HbProfile): { profile: HbProfile; percent: number }[] {
  const counts = new Map<HbProfile, number>();
  for (const a of p1) for (const b of p2) {
    const g = order(a, b);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return HB_PROFILES.filter((g) => counts.has(g)).map((g) => ({ profile: g, percent: (counts.get(g)! / 4) * 100 }));
}

/** Tableau de croisement (2 × 2) pour le schéma. */
export function hbGrid(p1: HbProfile, p2: HbProfile): HbProfile[][] {
  return [...p1].map((a) => [...p2].map((b) => order(a, b)));
}

// ---------------------------------------------------------------------------
// Groupes sanguins ABO et Rhésus
// ---------------------------------------------------------------------------
export type Abo = "A" | "B" | "AB" | "O";
export type Rh = "+" | "-";
export type BloodGroup = `${Abo}${Rh}`;
export const ABO: Abo[] = ["A", "B", "AB", "O"];
export const BLOOD_GROUPS: BloodGroup[] = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const ABO_GENOTYPES: Record<Abo, string[]> = { A: ["AA", "AO"], B: ["BB", "BO"], AB: ["AB"], O: ["OO"] };
const phenotype = (g: string): Abo => (g.includes("A") && g.includes("B") ? "AB" : g.includes("A") ? "A" : g.includes("B") ? "B" : "O");

/** Groupes ABO possibles pour un enfant (sans probabilité : le génotype exact des parents est inconnu). */
export function aboPossibleChildren(p1: Abo, p2: Abo): Abo[] {
  const out = new Set<Abo>();
  for (const g1 of ABO_GENOTYPES[p1]) for (const g2 of ABO_GENOTYPES[p2]) for (const a of g1) for (const b of g2) out.add(phenotype(a + b));
  return ABO.filter((x) => out.has(x));
}

/** Rhésus possibles pour un enfant. Rh+ peut être porteur du gène Rh− (Dd). */
export function rhPossibleChildren(p1: Rh, p2: Rh): Rh[] {
  return p1 === "-" && p2 === "-" ? ["-"] : ["+", "-"];
}

/** Donneurs de globules rouges compatibles pour un receveur (règle classique ABO + Rhésus). */
export function redCellDonors(recipient: BloodGroup): BloodGroup[] {
  const abo = recipient.slice(0, -1) as Abo;
  const rh = recipient.slice(-1) as Rh;
  const aboOk: Record<Abo, Abo[]> = { O: ["O"], A: ["A", "O"], B: ["B", "O"], AB: ["A", "B", "AB", "O"] };
  return BLOOD_GROUPS.filter((g) => {
    const ga = g.slice(0, -1) as Abo;
    const gr = g.slice(-1) as Rh;
    return aboOk[abo].includes(ga) && (rh === "+" || gr === "-");
  });
}

/** Receveurs pouvant recevoir les globules rouges d'un donneur. */
export function redCellRecipients(donor: BloodGroup): BloodGroup[] {
  return BLOOD_GROUPS.filter((r) => redCellDonors(r).includes(donor));
}

/** Situation Rhésus pendant une grossesse : vigilance seulement si la mère est Rh− et le père Rh+ (ou inconnu). */
export function rhPregnancyWatch(mother: Rh, father: Rh | "?"): boolean {
  return mother === "-" && father !== "-";
}
