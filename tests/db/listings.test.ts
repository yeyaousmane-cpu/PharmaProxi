/**
 * Annuaire des pharmacies non inscrites : import, dédoublonnage, normalisation,
 * cloisonnement (écriture réservée à l'administration), rattachement et recherche publique.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, Db, expectError, hasDb, q, World } from "./helpers";

describe.skipIf(!hasDb)("Pharmacies non inscrites", () => {
  let db: Db;
  let w: World;
  const imp = (uid: string, rows: unknown[]) =>
    q(db, uid, "select public.admin_import_listings($1::jsonb) as r", [JSON.stringify(rows)]).then((r) => r.rows[0].r);

  beforeAll(async () => {
    db = await createTestDb();
    w = await buildWorld(db);
  }, 120_000);
  afterAll(async () => db?.close());

  it("normalise les numéros maliens", async () => {
    const r = (await q(db, null, `select public.normalize_ml_phone('76-32-23-41') a, public.normalize_ml_phone('00223 63 43 32 73') b,
      public.normalize_ml_phone('+223 20 22 11 00') c, public.normalize_ml_phone('12') d, public.normalize_ml_phone('') e`)).rows[0];
    expect(r).toEqual({ a: "+22376322341", b: "+22363433273", c: "+22320221100", d: null, e: null });
  });

  it("seule l'administration peut importer ou écrire", async () => {
    await expectError(imp(w.customerA, [{ name: "X", region: "Bamako" }]), /réservée à l'administration/);
    await expectError(imp(w.ph1User, [{ name: "X", region: "Bamako" }]), /réservée à l'administration/);
    await expectError(q(db, w.customerA, "insert into public.pharmacy_listings (name, region_id) values ('X', $1)", [w.region]), /permission denied/);
  });

  it("importe, résout les zones, ignore les doublons et signale les erreurs ligne par ligne", async () => {
    const r = await imp(w.admin, [
      { line: 2, name: "Officine du Fleuve", region: "Bamako", commune: "Commune 3", address: "Rue 10", phone: "76-32-23-41", latitude: "12,65", longitude: "-8.01", source: "Terrain" },
      { line: 3, name: "OFFICINE DU FLEUVE", region: "District de Bamako", commune: "CIII" },
      { line: 4, name: "Officine Massigui", region: "Koulikoro", commune: "Massigui", quartier: "Centre", phone: "63 43 32 73" },
      { line: 5, name: "Sans région", region: "Atlantide" },
      { line: 6, name: "Mauvais tel", region: "Kayes", phone: "12" },
      { line: 7, name: "Hors Mali", region: "Kayes", latitude: "48.8", longitude: "2.35" },
      { line: 8, name: "Demi coordonnée", region: "Kayes", latitude: "14.4" },
      { line: 9, name: "", region: "Kayes" },
    ]);
    expect(r.imported).toBe(2);
    expect(r.duplicates).toBe(1);
    expect(r.failed).toBe(5);
    expect(r.errors.map((e: { row: number }) => e.row)).toEqual([5, 6, 7, 8, 9]);
    expect(r.errors[0].error).toMatch(/région inconnue/);

    const rows = (await q(db, w.admin, "select name, commune_id, area_label, phone, latitude from public.pharmacy_listings order by search_name")).rows;
    expect(rows[0]).toMatchObject({ name: "Officine du Fleuve", commune_id: w.c3, phone: "+22376322341", latitude: 12.65 });
    // Commune inconnue du référentiel : conservée en texte libre, jamais perdue
    expect(rows[1]).toMatchObject({ name: "Officine Massigui", commune_id: null, area_label: "Centre, Massigui", phone: "+22363433273" });

    // Ré-import : rien n'est dupliqué
    const again = await imp(w.admin, [{ name: "Officine du Fleuve", region: "Bamako", commune: "Commune III" }]);
    expect(again).toMatchObject({ imported: 0, duplicates: 1, failed: 0 });
  });

  it("le public voit les fiches publiées dans l'annuaire, avec les pharmacies vérifiées", async () => {
    const all = (await q(db, null, "select kind, name, phone from public.pharmacy_directory()")).rows;
    expect(all.map((r) => r.name)).toEqual(["Officine du Fleuve", "Officine Massigui", "Pharmacie Test Deux", "Pharmacie Test Un"]);
    expect(all.find((r) => r.name === "Officine Massigui").kind).toBe("listing");
    expect(all.find((r) => r.name === "Pharmacie Test Un").kind).toBe("verified");

    const onlyListings = (await q(db, null, "select name from public.pharmacy_directory(p_kind => 'listing')")).rows;
    expect(onlyListings).toHaveLength(2);
    const search = (await q(db, null, "select name, total_count from public.pharmacy_directory(p_query => 'fleuve')")).rows;
    expect(search.map((r) => r.name)).toEqual(["Officine du Fleuve"]);
    expect(Number(search[0].total_count)).toBe(1);
    const zone = (await q(db, null, "select name from public.pharmacy_directory(p_commune => $1)", [w.c3])).rows.map((r) => r.name).sort();
    expect(zone).toEqual(["Officine du Fleuve", "Pharmacie Test Un"]);
    const near = (await q(db, null, "select name, distance_km from public.pharmacy_directory(p_lat => 12.65, p_lng => -8.01, p_limit => 1)")).rows[0];
    expect(near.name).toBe("Officine du Fleuve");

    const map = (await q(db, null, "select name from public.map_listings()")).rows;
    expect(map.map((r) => r.name)).toEqual(["Officine du Fleuve"]);
  });

  it("une fiche dépubliée ou rattachée disparaît du public mais reste visible de l'administration", async () => {
    const id = (await q(db, w.admin, "select id from public.pharmacy_listings where name = 'Officine Massigui'")).rows[0].id;
    await q(db, w.admin, "select public.admin_set_listing_published($1, false)", [id]);
    expect((await q(db, null, "select id from public.pharmacy_listings where id = $1", [id])).rowCount).toBe(0);
    expect((await q(db, w.admin, "select id from public.pharmacy_listings where id = $1", [id])).rowCount).toBe(1);
    await q(db, w.admin, "select public.admin_set_listing_published($1, true)", [id]);

    const fleuve = (await q(db, w.admin, "select id from public.pharmacy_listings where name = 'Officine du Fleuve'")).rows[0].id;
    await expectError(q(db, w.admin, "select public.admin_link_listing($1, gen_random_uuid())", [fleuve]), /pharmacie vérifiée/);
    await q(db, w.admin, "select public.admin_link_listing($1, $2)", [fleuve, w.ph1]);
    expect((await q(db, null, "select name from public.pharmacy_directory(p_query => 'fleuve')")).rowCount).toBe(0);
    await q(db, w.admin, "select public.admin_link_listing($1, null)", [fleuve]);
    expect((await q(db, null, "select name from public.pharmacy_directory(p_query => 'fleuve')")).rowCount).toBe(1);
  });

  it("saisie, suggestions de rattachement, suppression et journal d'audit", async () => {
    const id = (await q(db, w.admin, "select public.admin_save_listing($1::jsonb) as id", [
      JSON.stringify({ name: "Pharmacie Test Un bis", region_id: w.region, commune_id: w.c3, phone: "76 00 00 01" }),
    ])).rows[0].id;
    await expectError(q(db, w.admin, "select public.admin_save_listing($1::jsonb)", [JSON.stringify({ name: "Officine du Fleuve", region_id: w.region, commune_id: w.c3 })]), /existe déjà|porte déjà ce nom/);
    await expectError(q(db, w.admin, "select public.admin_save_listing($1::jsonb)", [JSON.stringify({ name: "Y", region_id: w.region, phone: "abc" })]), /téléphone invalide/);
    const matches = (await q(db, w.admin, "select name from public.admin_listing_matches($1)", [id])).rows.map((r) => r.name);
    expect(matches[0]).toBe("Pharmacie Test Un");
    await q(db, w.admin, "select public.admin_delete_listing($1)", [id]);
    const audit = (await q(db, w.admin, "select action from public.audit_logs where entity_type = 'pharmacy_listing' order by created_at")).rows.map((r) => r.action);
    expect(audit).toEqual(expect.arrayContaining(["listing.import", "listing.create", "listing.delete", "listing.link", "listing.unpublish"]));
    const stats = (await q(db, w.admin, "select public.admin_listing_stats() as s")).rows[0].s;
    expect(stats).toMatchObject({ total: 2, published: 2, claimed: 0, with_phone: 2, with_position: 1 });
  });
});
