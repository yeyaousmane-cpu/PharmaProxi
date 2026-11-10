# SantéProxi — Multilingue, écoute et voix (0.27)

## Architecture retenue

| Service | Où | Rôle |
|---|---|---|
| i18n | `src/i18n/core.ts`, `src/i18n/dictionaries/*.ts`, `src/lib/i18n.ts` (serveur), `src/i18n/client.tsx` (navigateur) | Langues déclarées, dictionnaires par domaine (common, nav, emergency, auth, voice, health), résolution : traduction validée en base → dictionnaire → français → clé |
| RTL | `dir` sur `<html>`, classes logiques Tailwind (`ms-`, `pe-`, `start-`, `text-start`…), `rtl:-scale-x-100` sur les icônes directionnelles, `globals.css` (police arabe système, isolement bidi des numéros, e-mails, liens `tel:`) | Interface de droite à gauche |
| TTS | `src/lib/speech/providers.ts` → `TtsProvider` (implémentation : `browserTts`) ; composant `src/components/speech/listen-button.tsx` | Lecture à voix haute des contenus publics |
| STT | même fichier → `SttProvider` (implémentation : `browserStt`) | Reconnaissance d'une phrase, micro sur appui, arrêt auto 15 s |
| Assistant vocal | `src/lib/speech/intents.ts`, `src/components/speech/voice-assistant.tsx`, page `/parler` | Interprétation locale en propositions de pages ; aucune action exécutée |
| Contenus audio | tables `audio_languages`, `audio_targets`, `audio_clips` (0.15) | Messages enregistrés par des locuteurs, vérifiés, publiés |

Changer de fournisseur : écrire une autre implémentation de `TtsProvider` / `SttProvider`. Si elle exige une clé, l'appel passe par une route serveur ; la clé reste une variable d'environnement serveur, jamais dans le navigateur.

## Ajouter une langue

1. L'ajouter à `LANGUAGES` dans `src/i18n/core.ts` (libellé, code court, sens, code BCP 47, `ui`).
2. Ajouter la valeur à la contrainte `profiles_preferred_lang_check` et à `ui_translations_lang_check` (migration).
3. Traduire dans Administration → Langues (affiché seulement une fois validé) ou ajouter un dictionnaire.
4. `npx vitest run tests/unit/i18n.test.ts` signale les clés manquantes et les variables `{x}` oubliées.

## Variables d'environnement

Aucune nouvelle variable : la lecture et la reconnaissance utilisent le navigateur.

## Langues réellement disponibles (vérifiées le 10/11/2026)

| Langue | Interface | Écoute (TTS) | Voix (STT) | Messages enregistrés |
|---|---|---|---|---|
| Français | Complète | Selon l'appareil (voix FR présentes sur Android, iOS, Windows, macOS courants) | Chrome, Edge, Safari | Oui (guides audio) |
| Anglais | Complète, relecture native à faire | Selon l'appareil | Chrome, Edge, Safari | — |
| Arabe | Complète, relecture native à faire | Selon l'appareil | Chrome, Edge, Safari | — |
| Bambara, soninké, peul, songhaï | Textes validés seulement | Non | Non | Selon les enregistrements publiés |
| Tamasheq, dogon, sénoufo, bomu, bozo, khassonké, maninkakan, hassaniya, minianka, bobo | Non | Non | Non | Selon les enregistrements publiés |

Confidentialité : la reconnaissance vocale de Chrome et d'Edge envoie l'audio aux serveurs de l'éditeur du navigateur. SantéProxi l'annonce avant la première utilisation, n'enregistre ni voix ni texte, et demande de ne pas dicter d'informations médicales personnelles. Firefox ne propose pas la reconnaissance : l'écrit reste disponible partout.

## Limites connues

- Toutes les pages ne sont pas encore traduites : contenus, espaces professionnels, administration. Les pages non traduites sont affichées en français, de gauche à droite.
- Les traductions anglaises et arabes de l'interface doivent être relues par des locuteurs natifs.
- Pour les langues nationales, aucun moteur de synthèse ou de reconnaissance n'a été vérifié comme fiable. Il reste à étudier les ressources existantes pour le bambara (corpus, travaux universitaires, fournisseurs) : conditions, coût, hébergement des données.
