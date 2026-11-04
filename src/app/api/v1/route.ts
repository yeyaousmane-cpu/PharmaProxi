import { API_VERSION, LICENSE, json, options } from "@/lib/public-api";

export const OPTIONS = options;
export function GET() {
  return json({
    name: "API publique SantéProxi", version: API_VERSION, documentation: "/partenaires/api", license: LICENSE,
    access: "Lecture seule, sans clé, 60 requêtes par minute et par adresse. Aucune donnée personnelle ni de santé n'est exposée.",
    endpoints: {
      "GET /api/v1/pharmacies": "Annuaire : q, region, commune, lat, lng, inscrites (1), limit (≤ 100), offset",
      "GET /api/v1/garde": "Pharmacies de garde maintenant ou sur 7 jours : region, commune, lat, lng, semaine (1)",
      "GET /api/v1/laboratoires": "Laboratoires et établissements : q, region, examen (identifiant), limit, offset",
      "GET /api/v1/examens": "Catalogue des analyses et examens",
    },
    identifiers: "Chaque établissement porte un identifiant SantéProxi stable (PP-PH-…, PP-LB-…, PP-ET-…, PP-MD-…). Il ne remplace pas les identifiants des référentiels officiels.",
  }, 200, 3600);
}
