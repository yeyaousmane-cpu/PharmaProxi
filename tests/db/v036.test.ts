/** 0.36 : référentiel national (cercles, import sourcé sans écrasement, recherche tolérante, corrections modérées). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, Db, expectError, q, sys, World, hasDb } from "./helpers";

const payload = {
  documents: { "liste.pdf": { titre: "CANAM — Liste de test", url: "https://www.canam.ml/media/test.pdf", mise_en_ligne: "2022-03-18" } },
  etablissements: [
    { id: "a", name: "CSCOM de Sangarebougou", kind: "cscom", ownership: "communautaire", region: "Koulikoro", cercle: "Kati", locality: "Sangarebougou", official_code: "C696", doc: "liste.pdf", source_page: 9 },
    { id: "b", name: "Clinique Médicale Test Lafia", kind: "clinique", ownership: "prive", region: "District de Bamako", phone: "+22376000001", doc: "liste.pdf" },
    { id: "c", name: "CSCOM de Doubabougou", kind: "cscom", region: "Koulikoro", cercle: "Kati", doc: "liste.pdf" },
    { id: "d", name: "CSCOM de Doubabougou", kind: "cscom", region: "Koulikoro", cercle: "Kolokani", doc: "liste.pdf" },
  ],
  carte_sanitaire: [
    { msds_id: 1, name: "CSCOM de Sangarébougou", kind: "cscom", region: "Koulikoro", lat: 12.68, lng: -7.93, source: "Ministère — carte sanitaire", source_url: "https://www.sante.gov.ml/x",
      offers: [{ type: "service", code: "maternite", label: "Obstétrique / maternité" }] },
  ],
  editeur: [{ name: "Clinique Inconnue Test", kind: "clinique" }],
};

describe.skipIf(!hasDb)("Version 0.36 — référentiel national", () => {
  let db: Db; let w: World;
  beforeAll(async () => {
    db = await createTestDb(); w = await buildWorld(db);
    // fiche existante (liste de l'éditeur) : son téléphone ne doit jamais être écrasé
    await sys(db, "insert into public.facility_listings (name, kind, region_id, phone, source, source_level) select 'Clinique médicale Test Lafia', 'clinique', id, '+22366000002', 'Liste transmise par l''éditeur (non vérifiée)', 'editeur' from public.regions where name = 'District de Bamako'");
  }, 120_000);
  afterAll(async () => db?.close());

  it("159 cercles du découpage de 2023 ; Kati disponible (cercle et commune)", async () => {
    expect((await q(db, null, "select count(*)::int n from public.circles where official_code is not null")).rows[0].n).toBe(159);
    const k = (await q(db, null, "select c.name, r.name region from public.circles c join public.regions r on r.id = c.region_id where c.official_code = 'ML0204'")).rows[0];
    expect(k).toEqual({ name: "Kati", region: "Koulikoro" });
    expect((await q(db, null, "select count(*)::int n from public.directory_places() where level = 'commune' and name = 'Kati'")).rows[0].n).toBe(1);
  });

  it("import réservé à l'administration ; aucun écrasement ; sources conservées ; recoupement", async () => {
    await expectError(q(db, w.customerA, "select public.referentiel_import($1::jsonb)", [JSON.stringify(payload)]), /administration/);
    const res = (await q(db, w.admin, "select public.referentiel_import($1::jsonb) r", [JSON.stringify(payload)])).rows[0].r;
    expect(res.lignes_canam).toBe(4);
    const cl = (await sys(db, "select phone, phone2, source_level, alt_names from public.facility_listings where name = 'Clinique médicale Test Lafia'")).rows[0];
    expect(cl.phone).toBe("+22366000002"); expect(cl.phone2).toBe("+22376000001"); expect(cl.source_level).toBe("recoupee");
    const s = (await sys(db, "select f.latitude, f.source_level, f.circle_id is not null cercle, (select count(*)::int from public.facility_sources x where x.facility_id = f.id) n, (select status from public.facility_offers o where o.facility_id = f.id) offre from public.facility_listings f where f.official_code = 'C696'")).rows[0];
    expect(s).toEqual({ latitude: 12.68, source_level: "recoupee", cercle: true, n: 2, offre: "confirme" });
    // deux CSCOM homonymes de cercles différents : deux fiches distinctes
    expect((await sys(db, "select count(*)::int n from public.facility_listings where name = 'CSCOM de Doubabougou'")).rows[0].n).toBe(2);
    // nom cité par l'éditeur sans source officielle : non publié
    expect((await q(db, null, "select count(*)::int n from public.facility_listings where name = 'Clinique Inconnue Test'")).rows[0].n).toBe(0);
    // relancer l'import ne crée rien de plus
    const again = (await q(db, w.admin, "select public.referentiel_import($1::jsonb) r", [JSON.stringify(payload)])).rows[0].r;
    expect(again.fiches_apres).toBe(again.fiches_avant);
  });

  it("recherche tolérante, filtres hiérarchiques, pagination", async () => {
    expect((await q(db, null, "select name from public.directory_search('sangarebougou')")).rows[0].name).toBe("CSCOM de Sangarebougou");
    expect((await q(db, null, "select count(*)::int n from public.directory_search('sangarebogou')")).rows[0].n).toBeGreaterThanOrEqual(1);
    const kati = (await q(db, null, "select id from public.circles where official_code = 'ML0204'")).rows[0].id;
    expect((await q(db, null, "select max(total)::int n from public.directory_search(null, null, $1)", [kati])).rows[0].n).toBe(2);
    expect((await q(db, null, "select count(*)::int n from public.directory_search(null, null, $1, null, null, null, null, null, null, 1, 0)", [kati])).rows[0].n).toBe(1);
    expect((await q(db, null, "select count(*)::int n from public.directory_search(null, null, null, null, null, 'maternite')")).rows[0].n).toBe(1);
    const st = (await q(db, null, "select public.directory_stats() s")).rows[0].s;
    expect(st.geolocalises).toBeGreaterThanOrEqual(1);
  });

  it("valeurs brutes des sources et corrections : jamais publiques", async () => {
    await expectError(q(db, null, "select data from public.facility_sources"), /permission denied/);
    expect((await q(db, null, "select count(*)::int n from public.facility_sources")).rows[0].n).toBeGreaterThan(0);
    const fid = (await sys(db, "select id from public.facility_listings where official_code = 'C696'")).rows[0].id;
    await expectError(q(db, null, "select public.facility_correction_submit($1, 'ferme', 'Fermé depuis 2025')", [fid]), /permission denied/);
    const cid = (await q(db, w.customerA, "select public.facility_correction_submit($1, 'ferme', 'Fermé depuis 2025') id", [fid])).rows[0].id;
    expect((await q(db, w.customerB, "select count(*)::int n from public.facility_corrections")).rows[0].n).toBe(0);
    await expectError(q(db, w.customerA, "select public.admin_review_correction($1, 'acceptee')", [cid]), /administrat|réservé|PP403/);
    await q(db, w.admin, "select public.admin_review_correction($1, 'acceptee', 'Confirmé par la mairie')", [cid]);
    expect((await q(db, null, "select count(*)::int n from public.directory_search('sangarebougou')")).rows[0].n).toBe(0);
  });

  it("statut d'activité et contacts : confirmation tracée, jamais sans note", async () => {
    const fid = (await sys(db, "select id from public.facility_listings where name = 'Clinique médicale Test Lafia'")).rows[0].id;
    await expectError(q(db, w.admin, "select public.admin_set_facility_status($1, 'actif_confirme', 'confirme_etablissement', '')", [fid]), /comment/);
    await q(db, w.admin, "select public.admin_set_facility_status($1, 'actif_confirme', 'confirme_etablissement', 'Appel au standard le 12/11/2026')", [fid]);
    expect((await sys(db, "select contacts_status, operating_status from public.facility_listings where id = $1", [fid])).rows[0]).toEqual({ contacts_status: "confirme_etablissement", operating_status: "actif_confirme" });
    await expectError(q(db, w.admin, "select public.admin_link_facilities($1, $1, 'laboratoire_integre', 'test')", [fid]), /relation invalide/);
  });
});
