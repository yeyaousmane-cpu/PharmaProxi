import { z } from "zod";
import { normalizePhone } from "@/lib/format";

const optionalUuid = z.preprocess((v) => (v === "" || v === null ? undefined : v), z.uuid().optional());
const trimmed = (min: number, max: number, msg: string) => z.string().trim().min(min, msg).max(max, `${max} caractères maximum`);

export const phoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const p = normalizePhone(v);
    if (!p) {
      ctx.addIssue({ code: "custom", message: "Numéro invalide (ex. 70 00 00 00 ou +223 70 00 00 00)" });
      return z.NEVER;
    }
    return p;
  });

/** E-mail : espaces retirés (claviers mobiles) avant validation. */
const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Adresse e-mail invalide"));

const optionalPhone = z.preprocess((v) => (v === "" || v == null ? undefined : v), phoneSchema.optional());

export const signUpSchema = z.object({
  full_name: trimmed(2, 120, "Nom requis"),
  email: emailSchema,
  phone: optionalPhone,
  password: z.string().min(8, "8 caractères minimum").max(72),
  accept: z.literal("on", { message: "Vous devez accepter les conditions d'utilisation" }),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Mot de passe requis"),
});

export const profileSchema = z.object({
  full_name: trimmed(2, 120, "Nom requis"),
  phone: optionalPhone,
  preferred_region_id: optionalUuid,
  preferred_commune_id: optionalUuid,
  notify_in_app: z.preprocess((v) => v === "on", z.boolean()),
});

export const addressSchema = z.object({
  label: trimmed(1, 40, "Libellé requis"),
  region_id: z.uuid("Région requise"),
  commune_id: optionalUuid,
  locality_id: optionalUuid,
  address_line: trimmed(3, 300, "Adresse requise"),
  landmark: z.string().trim().max(200).optional(),
  contact_phone: phoneSchema,
});

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const DAY_LABELS: Record<(typeof DAYS)[number], string> = {
  mon: "Lundi", tue: "Mardi", wed: "Mercredi", thu: "Jeudi", fri: "Vendredi", sat: "Samedi", sun: "Dimanche",
};
export { DAYS };

const time = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

/** Construit le JSON d'horaires à partir des champs « open_mon », « close_mon »… */
export function parseOpeningHours(fd: FormData) {
  const hours: Record<string, [string, string][]> = {};
  for (const d of DAYS) {
    const o = String(fd.get(`open_${d}`) ?? "").trim();
    const c = String(fd.get(`close_${d}`) ?? "").trim();
    if (!o && !c) continue;
    if (!time.test(o) || !time.test(c)) throw new Error(`Horaires invalides pour ${DAY_LABELS[d]}`);
    hours[d] = [[o, c]];
  }
  return hours;
}

export const pharmacySchema = z
  .object({
    name: trimmed(2, 120, "Nom de la pharmacie requis"),
    address: trimmed(3, 300, "Adresse requise"),
    region_id: z.uuid("Région requise"),
    circle_id: optionalUuid,
    commune_id: optionalUuid,
    locality_id: optionalUuid,
    phone: phoneSchema,
    whatsapp: optionalPhone,
    email: z.preprocess((v) => (v === "" ? undefined : v), z.email("E-mail invalide").optional()),
    latitude: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().min(-90).max(90).optional()),
    longitude: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().min(-180).max(180).optional()),
    offers_pickup: z.preprocess((v) => v === "on", z.boolean()),
    offers_delivery: z.preprocess((v) => v === "on", z.boolean()),
  })
  .refine((v) => (v.latitude === undefined) === (v.longitude === undefined), {
    message: "Renseignez la latitude et la longitude ensemble",
    path: ["latitude"],
  });

export const pharmacyPrivateSchema = z.object({
  pharmacist_in_charge: trimmed(2, 120, "Nom du pharmacien responsable requis"),
  legal_name: z.string().trim().max(200).optional(),
  license_number: z.string().trim().max(100).optional(),
  order_registration: z.string().trim().max(100).optional(),
  tax_id: z.string().trim().max(50).optional(),
  rccm: z.string().trim().max(80).optional(),
  manager_phone: optionalPhone,
});

export const catalogItemSchema = z.object({
  brand_name: trimmed(2, 150, "Nom commercial requis"),
  generic_name: z.string().trim().max(150).optional(),
  active_ingredient: z.string().trim().max(200).optional(),
  dosage: z.string().trim().max(60).optional(),
  form: z.string().trim().max(60).optional(),
  packaging: z.string().trim().max(80).optional(),
  manufacturer: z.string().trim().max(120).optional(),
  category_id: optionalUuid,
});

export const stockSchema = z.object({
  quantity: z.coerce.number({ message: "Quantité invalide" }).int("Nombre entier attendu").min(0, "Quantité positive").max(1_000_000),
  price_xof: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(0).max(10_000_000).optional()),
  is_available: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  low_stock_threshold: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(0).max(100000).optional()),
});

export function fieldErrors(err: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = String(i.path[0] ?? "_");
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

export function formObject(fd: FormData) {
  const o: Record<string, string> = {};
  fd.forEach((v, k) => {
    if (typeof v === "string") o[k] = v;
  });
  return o;
}

// ---------------------------------------------------------------------------
// Annuaire médical
// ---------------------------------------------------------------------------
const LANG_CODES = ["fr", "bm", "snk", "ff", "son", "tmh", "dgo", "en", "ar"] as const;

export const doctorSchema = z.object({
  title: z.enum(["Dr", "Pr"]).default("Dr"),
  display_name: trimmed(2, 120, "Nom affiché requis"),
  gender: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["F", "M"]).optional()),
  order_number: trimmed(2, 60, "Numéro d'inscription à l'Ordre requis"),
  personal_phone: optionalPhone,
  languages: z.array(z.enum(LANG_CODES)).min(1, "Choisissez au moins une langue").max(9),
  specialties: z.array(z.uuid()).min(1, "Choisissez au moins une spécialité").max(4, "4 spécialités maximum"),
});

export const clinicSchema = z
  .object({
    name: trimmed(2, 120, "Nom de l'établissement requis"),
    kind: z.enum(["clinique", "cabinet", "centre_medical", "hopital"]),
    address: trimmed(3, 300, "Adresse requise"),
    region_id: z.uuid("Région requise"),
    commune_id: optionalUuid,
    locality_id: optionalUuid,
    phone: phoneSchema,
    whatsapp: optionalPhone,
    email: z.preprocess((v) => (v === "" ? undefined : v), z.email("E-mail invalide").optional()),
    latitude: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().min(-90).max(90).optional()),
    longitude: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().min(-180).max(180).optional()),
    emergency_24h: z.preprocess((v) => v === "on", z.boolean()),
    manager_name: trimmed(2, 120, "Nom du responsable requis"),
    manager_phone: optionalPhone,
    legal_name: z.string().trim().max(200).optional(),
    license_number: z.string().trim().max(100).optional(),
    rccm: z.string().trim().max(80).optional(),
    tax_id: z.string().trim().max(50).optional(),
  })
  .refine((v) => (v.latitude === undefined) === (v.longitude === undefined), {
    message: "Renseignez la latitude et la longitude ensemble",
    path: ["latitude"],
  });
