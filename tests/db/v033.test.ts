/** 0.33 : SantéProxi Orientation — fiches, fiabilité, spécialités, recherche. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, Db, expectError, q, sys, World, hasDb } from "./helpers";

describe.skipIf(!hasDb)("Version 0.33 — orientation", () => {
  let db: Db; let w: World;
  beforeAll(async () => { db = await createTestDb(); w = await buildWorld(db); }, 120_000);
  afterAll(async () => db?.close());
  const id = async (name: string) => (await sys(db, "select id from public.facility_listings where name = $1", [name])).rows[0].id as string;

  it("données initiales : rien n'est « vérifié », structures non établies non publiées", async () => {
    expect((await sys(db, "select count(*)::int n from public.facility_listings where reliability = 'verifie'")).rows[0].n).toBe(0);
    const names = (await q(db, null, "select name from public.orientation_search(null, 'dialyse')")).rows.map((r) => r.name);
    expect(names).not.toContain("Clinique médicale dialyse Le Relais");
    expect((await q(db, null, "select count(*)::int n from public.facility_listings where name like 'Clinique médicale dialyse%'")).rows[0].n).toBe(0);
    expect((await sys(db, "select count(*)::int n from public.facility_listings where latitude is not null and source like '[0.33]%'")).rows[0].n).toBe(0);
  });

  it("recherche par besoin : services confirmés par une source en premier", async () => {
    const rows = (await q(db, null, "select name, matched_status from public.orientation_search('rein_dialyse')")).rows;
    expect(rows.length).toBeGreaterThanOrEqual(6);
    const firstPending = rows.findIndex((r) => r.matched_status === "a_confirmer");
    expect(rows.slice(firstPending).every((r) => r.matched_status === "a_confirmer")).toBe(true);
    expect((await q(db, null, "select count(*)::int n from public.orientation_search('urgences_24h') where focus::text ilike '%24 h/24 non confirm%'")).rows[0].n).toBeGreaterThan(0);
  });

  it("filtre par région : hôpitaux régionaux, sans spécialité attribuée", async () => {
    const reg = (await sys(db, "select id from public.regions where name = 'Kayes'")).rows[0]?.id;
    if (!reg) return;
    const rows = (await q(db, null, "select name, focus from public.orientation_search(null, null, $1)", [reg])).rows;
    expect(rows.map((r) => r.name)).toContain("Hôpital Fousseyni Daou");
    expect(rows.find((r) => r.name === "Hôpital Fousseyni Daou").focus).toEqual([]);
  });

  it("« Vérifié » : administrateur seulement, avec une note ; une modification annule la vérification", async () => {
    const fid = await id("CHU IOTA – Institut d'ophtalmologie tropicale de l'Afrique");
    await expectError(q(db, w.customerA, "select public.admin_set_facility_reliability($1, 'verifie', 'appel au standard')", [fid]), /administrat|réservé/);
    await expectError(q(db, w.admin, "select public.admin_set_facility_reliability($1, 'verifie', '')", [fid]), /comment/);
    await q(db, w.admin, "select public.admin_set_facility_reliability($1, 'verifie', 'Confirmé par téléphone au standard le 11/11/2026')", [fid]);
    expect((await sys(db, "select reliability, verified_by is not null b from public.facility_listings where id = $1", [fid])).rows[0]).toEqual({ reliability: "verifie", b: true });
    await q(db, w.admin, "select public.admin_save_facility_details($1, $2::jsonb)", [fid, JSON.stringify({ kind: "chu", hours: "Lundi au vendredi" })]);
    expect((await sys(db, "select reliability from public.facility_listings where id = $1", [fid])).rows[0].reliability).toBe("a_confirmer");
    await expectError(q(db, w.admin, "select public.admin_save_facility_details($1, $2::jsonb)", [fid, JSON.stringify({ kind: "chu", latitude: "48.8", longitude: "2.3" })]), /vérifiez les champs/);
    await expectError(q(db, w.admin, "select public.admin_save_facility_details($1, $2::jsonb)", [fid, JSON.stringify({ kind: "chu", is_reference: true })]), /vérifiez les champs/);
    await expectError(q(db, w.customerA, "update public.facility_listings set reliability = 'verifie'"), /permission denied/);
  });

  it("distance : calculée seulement pour les structures dont la position est connue", async () => {
    const fid = await id("Golden Life American Hospital");
    await sys(db, "update public.facility_listings set latitude = 12.62, longitude = -7.99 where id = $1", [fid]);
    const rows = (await q(db, null, "select name, distance_km from public.orientation_search('rein_dialyse', null, null, null, null, null, 12.63, -8.0)")).rows;
    expect(rows[0].name).toBe("Golden Life American Hospital"); expect(rows[0].distance_km).toBeGreaterThan(0);
    expect(rows.filter((r) => r.name !== "Golden Life American Hospital").every((r) => r.distance_km === null)).toBe(true);
  });
});
