/** Annuaire médical : libellés, types et utilitaires partagés (serveur et client). */
import { DAYS, DAY_LABELS } from "@/lib/validation";

export type Schedule = Partial<Record<(typeof DAYS)[number], [string, string][]>>;
export type DirectoryFreshness = "fresh" | "to_confirm" | "stale";

export const LANGUAGES: Record<string, string> = {
  fr: "Français", bm: "Bambara", snk: "Soninké", ff: "Peul", son: "Songhaï", tmh: "Tamasheq", dgo: "Dogon", en: "Anglais", ar: "Arabe",
};

export const CLINIC_KINDS: Record<string, string> = {
  clinique: "Clinique", cabinet: "Cabinet médical", centre_medical: "Centre médical", hopital: "Hôpital",
};

/** Types des établissements non vérifiés (fiches d'annuaire simples). */
export const FACILITY_KINDS: Record<string, string> = {
  clinique: "Clinique", cabinet: "Cabinet médical", cabinet_dentaire: "Cabinet dentaire", centre_sante: "Centre de santé",
  csref: "Centre de santé de référence", hopital: "Hôpital", imagerie: "Imagerie médicale", laboratoire: "Laboratoire d'analyses",
};

export const CLINIC_SERVICES: Record<string, string> = {
  laboratoire: "Laboratoire d'analyses", imagerie: "Imagerie médicale", maternite: "Maternité", hospitalisation: "Hospitalisation",
  bloc_operatoire: "Bloc opératoire", pharmacie_interne: "Pharmacie interne",
};

export const DOCTOR_DOC_LABELS: Record<string, string> = {
  inscription_ordre: "Attestation d'inscription à l'Ordre des médecins", diplome_specialite: "Diplôme ou titre de spécialiste",
  piece_identite: "Pièce d'identité", autre: "Autre",
};

export const CLINIC_DOC_LABELS: Record<string, string> = {
  autorisation_ouverture: "Autorisation d'ouverture ou d'exercice", rccm: "RCCM", nif: "NIF", piece_identite: "Pièce d'identité du responsable", autre: "Autre",
};

export const DOCTOR_CHECKS: [string, string][] = [
  ["ordre", "Inscription à l'Ordre des médecins vérifiée auprès de l'Ordre"],
  ["diplome", "Diplôme ou titre conforme à chaque spécialité déclarée"],
  ["identite", "Pièce d'identité conforme"],
  ["lieu", "Au moins un lieu d'exercice cohérent"],
  ["telephone", "Téléphone professionnel joint et vérifié"],
];

export const CLINIC_CHECKS: [string, string][] = [
  ["autorisation", "Autorisation d'ouverture valide"],
  ["existence_legale", "Existence légale vérifiée (RCCM / NIF)"],
  ["responsable", "Responsable identifié"],
  ["adresse", "Adresse et position cohérentes"],
  ["telephone", "Téléphone vérifié par appel"],
];

export const DIRECTORY_FRESHNESS: Record<DirectoryFreshness, { label: string; className: string }> = {
  fresh: { label: "Informations confirmées", className: "border-sky-200 bg-brand-sky text-brand-blue" },
  to_confirm: { label: "À confirmer : appelez avant de vous déplacer", className: "border-amber-200 bg-amber-50 text-amber-900" },
  stale: { label: "Informations anciennes", className: "border-slate-200 bg-slate-100 text-slate-700" },
};

export const DAY_SHORT: Record<string, string> = { mon: "Lun", tue: "Mar", wed: "Mer", thu: "Jeu", fri: "Ven", sat: "Sam", sun: "Dim" };

/** « Lun, Mer, Sam » dans l'ordre de la semaine. */
export function daysSummary(days: string[]) {
  return DAYS.filter((d) => days.includes(d)).map((d) => DAY_SHORT[d]).join(", ");
}

export function scheduleLines(s: Schedule) {
  return DAYS.filter((d) => s?.[d]?.length).map((d) => ({ day: DAY_LABELS[d], slots: s[d]!.map(([a, b]) => `${a} – ${b}`).join(", ") }));
}

/** Construit un planning à partir des champs « open_mon », « close_mon », « open2_mon », « close2_mon »… */
export function parseSchedule(fd: FormData, prefix = "") {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  const end = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
  const out: Schedule = {};
  for (const d of DAYS) {
    const slots: [string, string][] = [];
    for (const n of ["", "2"]) {
      const o = String(fd.get(`${prefix}open${n}_${d}`) ?? "").trim();
      const c = String(fd.get(`${prefix}close${n}_${d}`) ?? "").trim();
      if (!o && !c) continue;
      if (!time.test(o) || !end.test(c) || o >= c) throw new Error(`Horaires invalides pour ${DAY_LABELS[d]} (début avant fin, format HH:MM).`);
      slots.push([o, c]);
    }
    if (slots.length) out[d] = slots.sort((a, b) => a[0].localeCompare(b[0]));
  }
  return out;
}

export function doctorLabel(d: { title?: string | null; display_name: string }) {
  return `${d.title ?? "Dr"} ${d.display_name}`;
}

/** Lien WhatsApp de partage d'une fiche (ANN-12). */
export function shareUrl(text: string, url: string) {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}

export const REVIEW_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "En attente de vérification", className: "border-amber-200 bg-amber-50 text-amber-900" },
  verified: { label: "Vérifiée et publiée", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  rejected: { label: "Demande refusée", className: "border-red-200 bg-red-50 text-red-800" },
  suspended: { label: "Suspendue", className: "border-slate-300 bg-slate-100 text-slate-800" },
};
