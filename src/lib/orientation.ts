/** SantéProxi Orientation : libellés, niveaux de fiabilité, mots courants → besoins. */
export const FACILITY_KINDS: Record<string, string> = {
  chu: "CHU", hopital: "Hôpital", centre_specialise: "Centre spécialisé", clinique: "Clinique / hôpital privé", csref: "CSRéf", cscom: "CSCom",
  centre_sante: "Centre de santé", cabinet: "Cabinet médical", cabinet_dentaire: "Cabinet dentaire", imagerie: "Imagerie médicale", urgences: "Urgences",
};
export const OWNERSHIP: Record<string, string> = { public: "Public", prive: "Privé", confessionnel: "Confessionnel", communautaire: "Communautaire", militaire: "Militaire" };

export const RELIABILITY: Record<string, { label: string; className: string; help: string }> = {
  verifie: { label: "Vérifié", className: "bg-emerald-100 text-emerald-900", help: "Informations confirmées par l'équipe SantéProxi auprès de l'établissement ou d'une source officielle." },
  a_confirmer: { label: "À confirmer", className: "bg-amber-100 text-amber-900", help: "Informations issues d'une source secondaire ou transmises à SantéProxi : appelez avant de vous déplacer." },
  incomplet: { label: "Information incomplète", className: "bg-slate-200 text-slate-800", help: "Établissement identifié, mais des informations importantes manquent encore." },
};
export const FOCUS_STATUS: Record<string, { label: string; className: string }> = {
  confirme: { label: "Confirmé par une source", className: "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200" },
  a_confirmer: { label: "À confirmer", className: "bg-amber-50 text-amber-900 ring-1 ring-amber-200" },
};

/** Mots que les gens tapent → besoin correspondant (recherche « saisir une maladie ou un service »). */
const SYNONYMS: [RegExp, string][] = [
  [/diab|sucre|glyc|insulin/, "diabete"],
  [/drepano|falciform|ss\b/, "drepanocytose"],
  [/coeur|cardi|tension|hypertens|avc/, "hypertension_coeur"],
  [/cancer|oncolog|tumeur|chimio/, "cancer"],
  [/mental|psychi|psycho|depress|folie|addict/, "sante_mentale"],
  [/accouch|matern|grossesse|enceinte|gyneco|obstetr|prenat|sage.femme/, "maternite"],
  [/enfant|bebe|pediatr|nourrisson|neonat/, "pediatrie"],
  [/\bvih\b|sida/, "vih"],
  [/tubercul|\btb\b/, "tuberculose"],
  [/rein|renal|dialys|nephro/, "rein_dialyse"],
  [/\byeux?\b|oeil|ophtalm|vue|lunette/, "yeux"],
  [/dent|odonto|stomato/, "dents"],
  [/\borl\b|oreille|nez|gorge/, "orl"],
  [/reeduc|kine|handicap|prothes|appareill|orthes|fauteuil/, "handicap_reeducation"],
  [/urgen/, "urgences_24h"],
  [/vaccin/, "vaccination"],
];
export function focusFromText(q: string): string | null {
  const t = q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const [re, code] of SYNONYMS) if (re.test(t)) return code;
  return null;
}

/** Précisions affichées pour certains besoins, en attendant les listes officielles. */
export const FOCUS_NOTES: Record<string, string> = {
  vih: "La prise en charge du VIH se fait dans des sites agréés (hôpitaux, CSRéf, centres habilités). SantéProxi intégrera la liste officielle actualisée du programme national dès qu'elle sera disponible : en attendant, aucun site n'est indiqué ici sans confirmation. Le dépistage est possible dans les centres de santé.",
  tuberculose: "La tuberculose est diagnostiquée et traitée dans les centres de diagnostic et de traitement (CDT), CSRéf et hôpitaux habilités. La liste officielle des CDT sera importée dès qu'elle sera disponible ; aucune structure n'est indiquée sans confirmation.",
  vaccination: "La vaccination du Programme élargi de vaccination (PEV) se fait dans les CSCom, les CSRéf et les hôpitaux publics. Les centres de vaccination seront ajoutés progressivement, région par région.",
  rein_dialyse: "Le ministère de la Santé indique que la dialyse se développe aussi dans les régions de Kayes, Sikasso, Ségou et Mopti : les établissements concernés seront ajoutés dès qu'ils seront identifiés précisément.",
  urgences_24h: "En cas d'urgence vitale, appelez immédiatement les numéros d'urgence (page Urgences) ou rendez-vous au service d'urgences le plus proche, sans attendre. L'ouverture 24 h/24 n'est indiquée que lorsqu'elle est confirmée.",
};

export type OrientationRow = { id: string; name: string; kind: string; ownership: string | null; region: string | null; commune: string | null; quarter: string | null;
  city: string | null; address: string | null; phone: string | null; latitude: number | null; longitude: number | null; reliability: string; verified_at: string | null;
  is_reference: boolean; focus: { code: string; label: string; status: string; detail: string | null }[]; matched_status: string | null; distance_km: number | null };

export const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
