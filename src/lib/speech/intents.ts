/**
 * Interprétation d'une demande (orale ou écrite) en propositions de navigation.
 * Règles simples, exécutées dans le navigateur : rien n'est envoyé à un service externe.
 * Aucune action n'est exécutée ici : l'utilisateur choisit une proposition, et les actions sensibles
 * (réserver, annuler, partager) restent soumises à la confirmation des pages concernées.
 * Ce module ne pose aucun diagnostic et ne recommande aucun traitement.
 */
export type Intent = { key: string; href: string; vars?: Record<string, string>; sensitive?: boolean };
export type Interpretation = { intents: Intent[]; urgent: boolean; medical: boolean; detected: "fr" | "en" | "ar" };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[ً-ْـ]/g, "").replace(/[’']/g, " ").replace(/\s+/g, " ").trim();

export function detectLang(text: string): "fr" | "en" | "ar" {
  if (/[؀-ۿ]/.test(text)) return "ar";
  const n = ` ${norm(text)} `;
  const en = (n.match(/ (the|i|want|need|find|where|looking|my|doctor|appointment|near|pharmacy|hospital|lab|help) /g) ?? []).length;
  const fr = (n.match(/ (je|le|la|les|un|une|veux|cherche|trouver|ou|mon|mes|medecin|rendez|pres|pharmacie|hopital|aide) /g) ?? []).length;
  return en > fr ? "en" : "fr";
}

type Rule = { key: string; href: string; words: RegExp; sensitive?: boolean };
const RULES: Rule[] = [
  { key: "intent.emergency", href: "/sos", words: /\b(urgence|urgent|ambulance|sos|samu|secours|emergency|accident)\b|طوارئ|إسعاف|اسعاف|نجدة|حادث/ },
  { key: "intent.duty", href: "/garde", words: /\b(de garde|garde|nuit|ouverte? maintenant|on duty|open now|night)\b|مناوبة|مناوب|الليل/ },
  { key: "intent.cancel", href: "/compte/rendez-vous", words: /\b(annuler|annulation|deplacer|reporter|cancel|reschedule)\b|إلغاء|الغاء|تأجيل/, sensitive: true },
  { key: "intent.my_appointments", href: "/compte/rendez-vous", words: /\b(mes rendez|mon rendez|mes rdv|my appointments?|consulter mes)\b|مواعيدي|موعدي/ },
  { key: "intent.book", href: "/rendez-vous", words: /\b(prendre rendez|rendez-vous|rendez vous|rdv|reserver un creneau|consultation|book|appointment)\b|موعد|حجز/, sensitive: true },
  { key: "intent.record", href: "/ma-sante/dossier", words: /\b(dossier|carnet de sante|mes resultats|health record|my records?|my results)\b|ملفي|الملف الصحي|نتائجي/ },
  { key: "intent.lab", href: "/laboratoires", words: /\b(laboratoire|labo|analyse|prise de sang|bilan|laboratory|lab|blood test)\b|مختبر|تحليل|تحاليل/ },
  { key: "intent.facility", href: "/cliniques", words: /\b(centre de sante|cscom|csref|hopital|clinique|maternite|hospital|clinic|health cent(er|re))\b|مستشفى|عيادة|مركز صحي/ },
  { key: "intent.doctor", href: "/medecins", words: /\b(medecin|docteur|pediatre|gynecologue|dentiste|specialiste|doctor|dentist|physician)\b|طبيب|دكتور/ },
  { key: "intent.mental", href: "/sante-mentale", words: /\b(stress|angoisse|anxiete|depression|deprime|triste|suicide|psy|psychologue|mental|anxiety|lonely)\b|نفسي|اكتئاب|قلق|حزين/ },
  { key: "intent.prevention", href: "/prevention", words: /\b(vaccin|vaccination|campagne|depistage|prevention|vaccine|screening|campaign)\b|تطعيم|لقاح|حملة|وقاية|كشف/ },
  { key: "intent.pharmacist", href: "/questions-pharmacien", words: /\b(pharmacien|pharmacist)\b|صيدلي(?![ةه])/ },
  { key: "intent.pharmacy", href: "/pharmacies", words: /\b(pharmacie|pharmacy|chemist|officine)\b|صيدلية|صيدليه/ },
  { key: "intent.help", href: "/aide", words: /\b(aide|comment|probleme|mot de passe|compte|help|how do i|password|account)\b|مساعدة|كيف|كلمة المرور/ },
];
const URGENT = /\b(ne respire|respire plus|inconscient|evanoui|saigne beaucoup|hemorragie|convulsion|crise cardiaque|avc|empoisonn|brule grave|not breathing|unconscious|bleeding heavily|heart attack|stroke|poisoned|suicide)\b|لا يتنفس|فاقد الوعي|نزيف|نوبة قلبية|تسمم|انتحار/;
const MEDICAL = /\b(j ai mal|mal a|mal au|douleur|fievre|tousse|toux|diarrhee|vomi|quel medicament prendre|combien de comprimes|dose|posologie|diagnostic|est ce grave|symptome|pain|fever|cough|what should i take|how many tablets|dosage|is it serious|symptom)\b|ألم|حمى|سعال|إسهال|جرعة|كم حبة|أعراض|هل هو خطير/;
const MED_SEARCH = /\b(?:je cherche|je veux|j ai besoin d?|trouver|acheter|ou trouver|looking for|i need|find|buy|where can i (?:find|buy))\s+(?:du |de la |de l |des |le |la |les |un |une |some |a |an |the )?([a-z0-9][a-z0-9 -]{2,40})/;
const NOT_MEDICINE = /(pharmacie|pharmacy|medecin|doctor|rendez|appointment|laboratoire|lab|hopital|hospital|clinique|clinic|centre|dossier|aide|help)/;

export function interpret(text: string): Interpretation {
  const n = norm(text);
  const detected = detectLang(text);
  const seen = new Set<string>();
  const intents: Intent[] = [];
  const add = (i: Intent) => { if (!seen.has(i.key + i.href)) { seen.add(i.key + i.href); intents.push(i); } };
  const urgent = URGENT.test(n);
  const medical = MEDICAL.test(n);
  if (urgent) add({ key: "intent.emergency", href: "/sos" });
  for (const r of RULES) if (r.words.test(n)) add({ key: r.key, href: r.href, sensitive: r.sensitive });
  const m = n.match(MED_SEARCH);
  if (m && !NOT_MEDICINE.test(m[1])) {
    const q = m[1].replace(/\b(a|au|a bamako|pres de chez moi|near me|please|svp|s il vous plait)\b.*$/, "").trim();
    if (q.length >= 3) add({ key: "intent.medicine", href: `/recherche?q=${encodeURIComponent(q)}`, vars: { q } });
  }
  // Une ville citée affine les annuaires (« … à Bamako »)
  const city = n.match(/\b(?:a|in|at)\s+(bamako|kati|kayes|sikasso|segou|mopti|koutiala|gao|tombouctou|kidal|san|bougouni|kita|nioro|koulikoro)\b/)?.[1];
  if (city) for (const i of intents) if (["/pharmacies", "/medecins", "/laboratoires", "/cliniques"].includes(i.href)) i.href += `?q=${encodeURIComponent(city)}`;
  if (medical) { add({ key: "intent.pharmacist", href: "/questions-pharmacien" }); add({ key: "intent.doctor", href: "/medecins" }); }
  return { intents: intents.slice(0, 4), urgent, medical, detected };
}
