/** Mon dossier santé : rubriques, champs, libellés français et anglais. Le patient remplit tout lui-même. */

export type Lang = "fr" | "en";
export type FieldType = "text" | "textarea" | "date" | "time" | "year" | "select" | "phone";
export type FieldName = "title" | "category" | "severity" | "detail" | "notes" | "result" | "year" | "event_date" | "event_time" | "next_date" | "place" | "who" | "phone";
export type FieldDef = { name: FieldName; label: string; en: string; type: FieldType; required?: boolean; options?: readonly string[]; suggestions?: readonly string[]; placeholder?: string };
export type ItemKind =
  | "allergie" | "maladie" | "operation" | "hospitalisation" | "transfusion" | "famille" | "ancien_traitement"
  | "analyse" | "consultation" | "preparation" | "rendez_vous" | "ordonnance" | "symptome" | "vaccin" | "soignant";
export type KindDef = { kind: ItemKind; label: string; en: string; add: string; empty: string; fields: FieldDef[]; order: "date" | "year" | "created" };

/** Champs chiffrés côté serveur (texte libre). */
export const SEALED: FieldName[] = ["detail", "notes", "result"];

export const SEVERITY: Record<string, { fr: string; en: string }> = {
  legere: { fr: "Légère", en: "Mild" }, moderee: { fr: "Modérée", en: "Moderate" }, grave: { fr: "Grave", en: "Severe" },
};

export const COMMON_CONDITIONS = ["Diabète", "Hypertension artérielle", "Asthme", "Drépanocytose", "Épilepsie", "Hépatite B", "Hépatite C",
  "Maladie du cœur", "Maladie des reins", "VIH", "Tuberculose", "Ulcère de l'estomac", "Glaucome", "Goitre (thyroïde)"] as const;

const ALLERGY_CAT = ["Médicament", "Aliment", "Piqûre d'insecte", "Produit (latex, savon…)", "Autre"] as const;
const FAMILY_WHO = ["Père", "Mère", "Frère ou sœur", "Grand-parent", "Autre"] as const;
const CARE_CAT = ["Médecin traitant", "Pharmacie habituelle", "Centre de santé", "Spécialiste", "Sage-femme", "Laboratoire", "Autre"] as const;
const SEV = ["legere", "moderee", "grave"] as const;

export const KINDS: Record<ItemKind, KindDef> = {
  allergie: { kind: "allergie", label: "Allergies", en: "Allergies", add: "Ajouter une allergie", empty: "Aucune allergie connue notée.", order: "created", fields: [
    { name: "title", label: "Allergique à", en: "Allergic to", type: "text", required: true, placeholder: "ex. Pénicilline, arachide" },
    { name: "category", label: "Type", en: "Type", type: "select", options: ALLERGY_CAT },
    { name: "detail", label: "Ce que ça provoque", en: "Reaction", type: "text", placeholder: "ex. boutons, gonflement, difficulté à respirer" },
    { name: "severity", label: "Gravité", en: "Severity", type: "select", options: SEV },
  ] },
  maladie: { kind: "maladie", label: "Maladies connues", en: "Known conditions", add: "Ajouter une maladie", empty: "Aucune maladie notée.", order: "year", fields: [
    { name: "title", label: "Maladie", en: "Condition", type: "text", required: true, suggestions: COMMON_CONDITIONS },
    { name: "year", label: "Découverte en (année)", en: "Diagnosed in", type: "year" },
    { name: "detail", label: "Précisions", en: "Details", type: "text" },
  ] },
  operation: { kind: "operation", label: "Opérations", en: "Surgeries", add: "Ajouter une opération", empty: "Aucune opération notée.", order: "year", fields: [
    { name: "title", label: "Opération", en: "Surgery", type: "text", required: true, placeholder: "ex. Césarienne, appendicite" },
    { name: "year", label: "Année", en: "Year", type: "year" },
    { name: "place", label: "Hôpital ou clinique", en: "Hospital", type: "text" },
    { name: "detail", label: "Précisions", en: "Details", type: "text" },
  ] },
  hospitalisation: { kind: "hospitalisation", label: "Hospitalisations importantes", en: "Hospital stays", add: "Ajouter une hospitalisation", empty: "Aucune hospitalisation notée.", order: "year", fields: [
    { name: "title", label: "Motif", en: "Reason", type: "text", required: true, placeholder: "ex. Paludisme grave" },
    { name: "year", label: "Année", en: "Year", type: "year" },
    { name: "place", label: "Hôpital", en: "Hospital", type: "text" },
    { name: "detail", label: "Précisions", en: "Details", type: "text" },
  ] },
  transfusion: { kind: "transfusion", label: "Transfusions de sang reçues", en: "Blood transfusions received", add: "Ajouter une transfusion", empty: "Aucune transfusion notée.", order: "year", fields: [
    { name: "title", label: "Raison", en: "Reason", type: "text", required: true, placeholder: "ex. Accouchement, anémie" },
    { name: "year", label: "Année", en: "Year", type: "year" },
    { name: "place", label: "Hôpital", en: "Hospital", type: "text" },
  ] },
  famille: { kind: "famille", label: "Maladies dans la famille proche", en: "Family history", add: "Ajouter", empty: "Rien de noté (facultatif).", order: "created", fields: [
    { name: "title", label: "Maladie", en: "Condition", type: "text", required: true, suggestions: COMMON_CONDITIONS },
    { name: "category", label: "Qui", en: "Who", type: "select", options: FAMILY_WHO },
  ] },
  ancien_traitement: { kind: "ancien_traitement", label: "Anciens traitements importants", en: "Past treatments", add: "Ajouter un ancien traitement", empty: "Aucun ancien traitement noté.", order: "year", fields: [
    { name: "title", label: "Médicament", en: "Medicine", type: "text", required: true },
    { name: "year", label: "Arrêté en (année)", en: "Stopped in", type: "year" },
    { name: "detail", label: "Raison de l'arrêt", en: "Why stopped", type: "text", placeholder: "ex. mal toléré, guéri, remplacé" },
  ] },
  vaccin: { kind: "vaccin", label: "Vaccins (adulte)", en: "Vaccines", add: "Ajouter un vaccin", empty: "Aucun vaccin noté.", order: "date", fields: [
    { name: "title", label: "Vaccin", en: "Vaccine", type: "text", required: true, suggestions: ["Tétanos", "Hépatite B", "Fièvre jaune", "Méningite", "COVID-19", "Typhoïde", "Rage", "Grippe"] },
    { name: "event_date", label: "Fait le", en: "Date", type: "date" },
    { name: "next_date", label: "Prochain rappel (si connu)", en: "Next booster", type: "date" },
    { name: "place", label: "Lieu", en: "Place", type: "text" },
  ] },
  analyse: { kind: "analyse", label: "Analyses et examens", en: "Tests and exams", add: "Ajouter une analyse", empty: "Aucune analyse notée.", order: "date", fields: [
    { name: "title", label: "Analyse ou examen", en: "Test", type: "text", required: true, suggestions: ["NFS (numération formule sanguine)", "Glycémie", "HbA1c", "TDR paludisme", "Goutte épaisse", "Créatinine", "Groupe sanguin", "Électrophorèse de l'hémoglobine", "Sérologie hépatite B", "Échographie", "Radiographie", "ECG"] },
    { name: "event_date", label: "Date", en: "Date", type: "date", required: true },
    { name: "place", label: "Laboratoire ou centre", en: "Laboratory", type: "text" },
    { name: "result", label: "Résultat principal", en: "Main result", type: "text", placeholder: "ex. hémoglobine 11 g/dL" },
    { name: "notes", label: "Commentaire", en: "Comment", type: "text" },
  ] },
  rendez_vous: { kind: "rendez_vous", label: "Prochains rendez-vous", en: "Appointments", add: "Ajouter un rendez-vous", empty: "Aucun rendez-vous prévu.", order: "date", fields: [
    { name: "title", label: "Avec qui, pour quoi", en: "With / for", type: "text", required: true, placeholder: "ex. Cardiologue, contrôle tension" },
    { name: "event_date", label: "Date", en: "Date", type: "date", required: true },
    { name: "event_time", label: "Heure", en: "Time", type: "time" },
    { name: "place", label: "Lieu", en: "Place", type: "text" },
    { name: "phone", label: "Téléphone", en: "Phone", type: "phone" },
  ] },
  preparation: { kind: "preparation", label: "Préparer ma consultation", en: "Visit preparation", add: "Préparer une consultation", empty: "Rien de préparé.", order: "created", fields: [
    { name: "title", label: "Consultation (avec qui)", en: "Visit", type: "text", required: true, placeholder: "ex. Médecin du CSCom, lundi" },
    { name: "event_date", label: "Date prévue", en: "Date", type: "date" },
    { name: "detail", label: "Ce que je ressens, depuis quand", en: "Symptoms, since when", type: "textarea" },
    { name: "notes", label: "Mes questions", en: "My questions", type: "textarea" },
    { name: "result", label: "Après : ce que le médecin a dit", en: "Doctor's instructions", type: "textarea" },
  ] },
  consultation: { kind: "consultation", label: "Historique des consultations", en: "Past visits", add: "Noter une consultation", empty: "Aucune consultation notée.", order: "date", fields: [
    { name: "event_date", label: "Date", en: "Date", type: "date", required: true },
    { name: "title", label: "Motif", en: "Reason", type: "text", required: true },
    { name: "place", label: "Centre de santé", en: "Facility", type: "text" },
    { name: "who", label: "Médecin", en: "Doctor", type: "text" },
    { name: "detail", label: "Ce que le médecin a dit", en: "What the doctor said", type: "textarea" },
    { name: "notes", label: "Consignes", en: "Instructions", type: "textarea" },
  ] },
  ordonnance: { kind: "ordonnance", label: "Mes ordonnances", en: "Prescriptions", add: "Ajouter un médicament prescrit", empty: "Aucune ordonnance notée.", order: "date", fields: [
    { name: "title", label: "Médicament (nom et dosage)", en: "Medicine", type: "text", required: true, placeholder: "ex. Amoxicilline 500 mg" },
    { name: "detail", label: "Comment le prendre", en: "How to take", type: "text", placeholder: "ex. 1 gélule matin et soir pendant 7 jours" },
    { name: "event_date", label: "Date de l'ordonnance", en: "Date", type: "date" },
    { name: "who", label: "Prescrit par", en: "Prescribed by", type: "text" },
  ] },
  symptome: { kind: "symptome", label: "Journal de symptômes", en: "Symptom log", add: "Noter un symptôme", empty: "Rien de noté.", order: "date", fields: [
    { name: "event_date", label: "Date", en: "Date", type: "date", required: true },
    { name: "title", label: "Symptôme", en: "Symptom", type: "text", required: true, suggestions: ["Fièvre", "Douleur", "Crise drépanocytaire", "Crise d'asthme", "Crise d'épilepsie", "Maux de tête", "Vertiges", "Vomissements", "Diarrhée", "Toux", "Essoufflement", "Fatigue"] },
    { name: "severity", label: "Intensité", en: "Intensity", type: "select", options: SEV },
    { name: "detail", label: "Détails (durée, ce qui a aidé)", en: "Details", type: "text" },
  ] },
  soignant: { kind: "soignant", label: "Mes soignants habituels", en: "My care providers", add: "Ajouter un soignant", empty: "Aucun soignant noté.", order: "created", fields: [
    { name: "category", label: "Type", en: "Type", type: "select", options: CARE_CAT },
    { name: "title", label: "Nom", en: "Name", type: "text", required: true, placeholder: "ex. Dr Traoré, Pharmacie du Fleuve" },
    { name: "phone", label: "Téléphone", en: "Phone", type: "phone" },
    { name: "place", label: "Adresse", en: "Address", type: "text" },
  ] },
};

export const RELATIONS: Record<string, string> = {
  moi: "Moi", enfant: "Enfant", pere: "Père", mere: "Mère", conjoint: "Conjoint(e)", "grand-parent": "Grand-parent", "frere-soeur": "Frère ou sœur", autre: "Autre",
};
export const COVERAGE: Record<string, { fr: string; en: string }> = {
  amo: { fr: "AMO (CANAM)", en: "AMO (national health insurance)" }, inps: { fr: "INPS", en: "INPS" }, assurance: { fr: "Assurance privée", en: "Private insurance" },
  mutuelle: { fr: "Mutuelle", en: "Mutual insurance" }, ramed: { fr: "RAMED", en: "RAMED" }, aucune: { fr: "Aucune", en: "None" },
};
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

/** Libellés fixes du résumé, en français et en anglais. */
export const T = {
  summary: { fr: "Résumé de santé", en: "Health summary" },
  declared: { fr: "Informations renseignées par le patient lui-même, non vérifiées par un professionnel.", en: "Information entered by the patient, not verified by a health professional." },
  essentials: { fr: "Informations essentielles", en: "Key information" },
  blood: { fr: "Groupe sanguin", en: "Blood group" },
  unknown: { fr: "Inconnu", en: "Unknown" },
  height: { fr: "Taille", en: "Height" },
  weight: { fr: "Poids", en: "Weight" },
  pregnant: { fr: "Enceinte", en: "Pregnant" },
  breastfeeding: { fr: "Allaite", en: "Breastfeeding" },
  born: { fr: "Né(e) en", en: "Born in" },
  sex: { fr: "Sexe", en: "Sex" },
  F: { fr: "Femme", en: "Female" },
  M: { fr: "Homme", en: "Male" },
  emergency: { fr: "Personne à prévenir", en: "Emergency contact" },
  coverage: { fr: "Couverture santé", en: "Health coverage" },
  current: { fr: "Traitements en cours", en: "Current medicines" },
  measures: { fr: "Dernières mesures", en: "Latest readings" },
  bp: { fr: "Tension", en: "Blood pressure" },
  glucose: { fr: "Glycémie", en: "Blood glucose" },
  pregnancy: { fr: "Grossesse", en: "Pregnancy" },
  weeks: { fr: "semaines d'aménorrhée", en: "weeks of pregnancy" },
  due: { fr: "terme prévu le", en: "due date" },
  none: { fr: "Aucune connue", en: "None known" },
  printed: { fr: "Imprimé le", en: "Printed on" },
  allergyWarn: { fr: "ALLERGIES GRAVES", en: "SEVERE ALLERGIES" },
} as const;
export const tr = (k: keyof typeof T, lang: Lang) => T[k][lang];

/** Rappel d'allergie : le nom d'un médicament ressemble-t-il à une allergie que le patient a lui-même déclarée ? */
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const FAMILIES: Record<string, string[]> = {
  penicilline: ["penicilline", "amoxicilline", "ampicilline", "augmentin", "oxacilline", "cloxacilline", "extencilline", "benzathine"],
  aspirine: ["aspirine", "acide acetylsalicylique", "aspegic", "kardegic"],
  sulfamide: ["sulfamide", "cotrimoxazole", "bactrim", "sulfamethoxazole", "sulfadoxine"],
};
export function allergyMatches(medicine: string, allergies: string[]): string[] {
  const m = norm(medicine);
  if (m.length < 3) return [];
  const words = m.split(" ").filter((w) => w.length >= 4);
  return allergies.filter((a) => {
    const n = norm(a);
    if (n.length < 3) return false;
    if (m.includes(n) || words.some((w) => n.includes(w))) return true;
    return Object.values(FAMILIES).some((fam) => fam.some((x) => n.includes(x)) && fam.some((x) => m.includes(x)));
  });
}

export function nextDonationDate(last: string | null, sex: string | null): string | null {
  if (!last) return null;
  const d = new Date(`${last}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + (sex === "M" ? 3 : 4));
  return d.toISOString().slice(0, 10);
}

export function sortItems<T extends { year: number | null; event_date: string | null; created_at: string }>(items: T[], order: KindDef["order"]) {
  const key = (i: T) => order === "date" ? (i.event_date ?? "") : order === "year" ? String(i.year ?? "") : i.created_at;
  return [...items].sort((a, b) => key(b).localeCompare(key(a)));
}
