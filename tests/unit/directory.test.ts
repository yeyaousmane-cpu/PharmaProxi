import { describe, expect, it } from "vitest";
import { daysSummary, parseSchedule, scheduleLines, shareUrl } from "@/lib/directory";
import { clinicSchema, doctorSchema } from "@/lib/validation";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
};

describe("annuaire : planning", () => {
  it("construit un planning à deux plages, trié", () => {
    const s = parseSchedule(fd({ open_mon: "15:00", close_mon: "18:00", open2_mon: "08:00", close2_mon: "12:00", open_sat: "09:00", close_sat: "12:00" }));
    expect(s).toEqual({ mon: [["08:00", "12:00"], ["15:00", "18:00"]], sat: [["09:00", "12:00"]] });
  });
  it("refuse une plage dont la fin précède le début ou un format invalide", () => {
    expect(() => parseSchedule(fd({ open_tue: "12:00", close_tue: "08:00" }))).toThrow(/Mardi/);
    expect(() => parseSchedule(fd({ open_tue: "8h", close_tue: "12:00" }))).toThrow(/Mardi/);
    expect(() => parseSchedule(fd({ open_tue: "08:00" }))).toThrow(/Mardi/);
  });
  it("résume les jours dans l'ordre de la semaine", () => {
    expect(daysSummary(["sat", "mon", "wed"])).toBe("Lun, Mer, Sam");
    expect(scheduleLines({ wed: [["08:00", "12:00"]] })).toEqual([{ day: "Mercredi", slots: "08:00 – 12:00" }]);
  });
  it("prépare un lien de partage WhatsApp encodé", () => {
    expect(shareUrl("Dr X — Cardiologie", "https://exemple.ml/medecins/1")).toBe(
      "https://wa.me/?text=Dr%20X%20%E2%80%94%20Cardiologie%20https%3A%2F%2Fexemple.ml%2Fmedecins%2F1");
  });
});

describe("annuaire : validation des formulaires", () => {
  const spec = "6f1c0d3e-6a1b-4b5e-9f3a-1c2d3e4f5a6b";
  it("fiche médecin : spécialités 1 à 4, langues connues, téléphone normalisé", () => {
    const ok = doctorSchema.safeParse({ display_name: "Awa Diallo", order_number: "ML-1", languages: ["fr", "bm"], specialties: [spec], personal_phone: "70 00 00 00" });
    expect(ok.success && ok.data.personal_phone).toBe("+22370000000");
    expect(doctorSchema.safeParse({ display_name: "Awa", order_number: "1", languages: ["fr"], specialties: [] }).success).toBe(false);
    expect(doctorSchema.safeParse({ display_name: "Awa", order_number: "1", languages: ["xx"], specialties: [spec] }).success).toBe(false);
    expect(doctorSchema.safeParse({ display_name: "Awa", order_number: "1", languages: ["fr"], specialties: [spec, spec, spec, spec, spec] }).success).toBe(false);
  });
  it("établissement : responsable obligatoire, coordonnées GPS ensemble", () => {
    const base = { name: "Clinique", kind: "clinique", address: "Rue 1", region_id: spec, phone: "20 00 00 00", manager_name: "M. X" };
    expect(clinicSchema.safeParse(base).success).toBe(true);
    expect(clinicSchema.safeParse({ ...base, manager_name: "" }).success).toBe(false);
    expect(clinicSchema.safeParse({ ...base, latitude: "12.6" }).success).toBe(false);
    expect(clinicSchema.safeParse({ ...base, kind: "spa" }).success).toBe(false);
  });
});
