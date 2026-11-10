/**
 * Dictionnaires de l'interface, par domaine (common, nav, emergency, auth, voice, health).
 * Le français est la référence : toute clé doit exister en français ; une clé absente d'une autre
 * langue retombe automatiquement sur le français (voir tests/unit/i18n.test.ts).
 */
import { auth } from "./auth";
import { common } from "./common";
import { emergency } from "./emergency";
import { health } from "./health";
import { nav } from "./nav";
import { voice } from "./voice";

const domains = [common, nav, emergency, auth, voice, health];
const merge = <L extends "fr" | "en" | "ar">(l: L) => Object.assign({}, ...domains.map((d) => d[l])) as (typeof domains)[number]["fr"] & (typeof common)["fr"] & (typeof nav)["fr"] & (typeof emergency)["fr"] & (typeof auth)["fr"] & (typeof voice)["fr"] & (typeof health)["fr"];

export const DICTIONARIES = { fr: merge("fr"), en: merge("en"), ar: merge("ar") };
