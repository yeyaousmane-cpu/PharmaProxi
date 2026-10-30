/**
 * Garde-fous de l'assistant santé, appliqués AVANT tout appel à l'IA.
 * Une situation d'urgence reçoit immédiatement une réponse fixe (sans IA) qui oriente vers les secours.
 */
export const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, " ").replace(/\s+/g, " ");

export type Urgency = { kind: "urgence" | "detresse"; reason: string } | null;

const RULES: [RegExp, string, "urgence" | "detresse"][] = [
  [/(suicid|me tuer|me suicider|mettre fin a (mes|ma) (jours|vie)|en finir avec (la|ma) vie|plus envie de vivre)/, "idées suicidaires", "detresse"],
  [/(douleur|mal|serre|oppression).{0,25}(poitrine|thorax|coeur)/, "douleur dans la poitrine", "urgence"],
  [/(ne respire (plus|pas)|respire (tres )?mal|du mal a respirer|difficulte(s)? (a|pour) respirer|etouff|lèvres bleues|levres bleues)/, "difficulté à respirer", "urgence"],
  [/(perte de connaissance|perdu connaissance|evanoui|inconscient|ne repond plus|ne se reveille pas|coma)/, "perte de connaissance", "urgence"],
  [/(convuls|crise d epilepsie|tremble de tout son corps et ne repond)/, "convulsions", "urgence"],
  [/(saigne beaucoup|hemorragi|perd beaucoup de sang|vomi(t|s)? du sang|crache du sang|sang dans les selles noires)/, "saignement important", "urgence"],
  [/(paralys|bouche de travers|visage (qui )?tombe|ne (peut|arrive) plus parler|parole difficile soudain|bras (qui )?ne bouge plus)/, "signes d'AVC", "urgence"],
  [/(empoisonn|intoxi|a avale (du|de l|des|un|une)|bu de l eau de javel|produit menager|petrole|pesticide|surdose|trop de comprimes|trop de medicaments)/, "intoxication", "urgence"],
  [/(raideur (de|a) la nuque|nuque raide)/, "raideur de la nuque", "urgence"],
  [/((bebe|nourrisson|nouveau ne)\b.{0,40}(fievre|chaud|ne tete plus|ne mange plus|convuls|somnolent|mou))/, "nourrisson malade", "urgence"],
  [/((enceinte|grossesse).{0,40}(saign|perte de liquide|convuls|ne sent plus (le|son) bebe|forte douleur|maux de tete violents))/, "signe d'alerte pendant la grossesse", "urgence"],
  [/(morsure de serpent|mordu par un serpent|piqure de scorpion)/, "morsure ou piqûre venimeuse", "urgence"],
  [/(brulure (grave|grande|profonde|au visage)|grande brulure)/, "brûlure grave", "urgence"],
  [/(accident (de la route|de moto|de voiture)|chute grave|traumatisme cranien|coup a la tete.{0,30}(vomi|endormi|confus))/, "accident ou traumatisme", "urgence"],
];

export function detectUrgency(text: string): Urgency {
  const t = norm(text);
  for (const [re, reason, kind] of RULES) if (re.test(t)) return { kind, reason };
  return null;
}

export function urgencyAnswer(u: NonNullable<Urgency>, numbers: string | null): string {
  const call = numbers ? `Appelez les secours : **${numbers}**.` : "Appelez les secours ou faites-vous conduire immédiatement au service d'urgence le plus proche.";
  if (u.kind === "detresse") {
    return [
      "Je suis vraiment désolé que vous traversiez un moment aussi difficile. Vous n'êtes pas seul(e), et votre vie compte.",
      "**Parlez-en maintenant à quelqu'un** : une personne de confiance de votre famille, un ami, un religieux, ou un professionnel de santé.",
      `Si vous êtes en danger immédiat, rendez-vous au service d'urgence le plus proche. ${numbers ? `Numéros d'urgence : **${numbers}**.` : ""}`,
      "Un médecin peut vous aider, même si cela semble difficile aujourd'hui. [Trouver un médecin](/medecins) · [Urgences](/urgences)",
    ].join("\n\n");
  }
  return [
    `⚠️ **Ce que vous décrivez (${u.reason}) peut être une urgence.**`,
    `Ne restez pas seul(e) avec ce problème et n'attendez pas : **rendez-vous immédiatement au service d'urgence le plus proche**. ${call}`,
    "Ne donnez pas de médicament sans avis médical en attendant.",
    "[Voir les services d'urgence et les pharmacies de garde](/urgences)",
  ].join("\n\n");
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

/** Contrôle de la conversation reçue du navigateur. */
export function sanitizeConversation(input: unknown): ChatMessage[] | { error: string } {
  if (!Array.isArray(input) || input.length === 0) return { error: "Conversation vide." };
  const msgs = input.slice(-12).map((m) => ({
    role: (m as ChatMessage)?.role === "assistant" ? "assistant" : "user",
    content: String((m as ChatMessage)?.content ?? "").replace(/\u0000/g, "").trim().slice(0, 2000),
  })) as ChatMessage[];
  if (msgs.some((m) => !m.content)) return { error: "Message vide." };
  if (msgs[msgs.length - 1].role !== "user") return { error: "Le dernier message doit être votre question." };
  if (msgs[msgs.length - 1].content.length > 1000) return { error: "Question trop longue (1 000 caractères maximum)." };
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  // L'API exige l'alternance des rôles : on fusionne les messages consécutifs du même auteur.
  const merged: ChatMessage[] = [];
  for (const m of msgs) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === m.role) prev.content = `${prev.content}\n\n${m.content}`;
    else merged.push({ ...m });
  }
  return merged;
}
