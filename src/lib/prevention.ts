export type PreventionEvent = {
  id: string; kind: "campagne" | "depistage" | "vaccination" | "sensibilisation" | "journee_mondiale"; title: string; description: string;
  starts_on: string; ends_on: string | null; region_id: string | null; place: string | null; organizer: string; source_name: string; source_url: string | null;
  public_concerned: string | null; is_free: boolean | null; status: "brouillon" | "publie" | "annule"; regions?: { name: string } | null;
};
export const PREVENTION_KINDS = ["campagne", "depistage", "vaccination", "sensibilisation", "journee_mondiale"] as const;
