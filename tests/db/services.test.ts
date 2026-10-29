/**
 * Services pratiques : pharmacies de garde, laboratoires et examens, alertes de disponibilité,
 * signaux de demande, observatoire des ruptures, répertoire d'urgence.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, hasDb, q, sys, World } from "./helpers";

function dayIn(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

describe.skipIf(!hasDb)("Services pratiques", () => {
  let db: Db;
  let w: World;
  let stranger: string;

  beforeAll(async () => {
    db = await createTestDb();
    w = await buildWorld(db);
    stranger = await createUser(db, "inconnu");
    await q(db, w.admin, "select public.admin_import_listings($1::jsonb)", [JSON.stringify([
      { line: 2, name: "Pharmacie du Fleuve", region: "Bamako", commune: "Commune IV", phone: "76 00 00 01", address: "Lafiabougou" },
    ])]);
  }, 120_000);
  afterAll(async () => db?.close());

  it("garde : import du tableau (pharmacie vérifiée ou annuaire), erreurs explicites, lecture publique", async () => {
    const today = dayIn(0);
    const r = (await q(db, w.admin, "select public.admin_import_duty($1::jsonb) as r", [JSON.stringify([
      { line: 2, pharmacie: "Pharmacie Test Un", region: "Bamako", debut: today },
      { line: 3, pharmacie: "pharmacie du fleuve", region: "Bamako", commune: "Commune IV", debut: `${today} 08:00`, fin: `${dayIn(1)} 08:00` },
      { line: 4, pharmacie: "Pharmacie Inconnue", region: "Bamako", debut: today },
      { line: 5, pharmacie: "Pharmacie Test Deux", region: "Bamako", debut: "pas une date" },
      { line: 6, pharmacie: "Pharmacie Test Deux", region: "Bamako", debut: `${today} 20:00`, fin: `${today} 08:00` },
    ])])).rows[0].r;
    expect(r.imported).toBe(2);
    expect(r.errors.map((e: { row: number }) => e.row)).toEqual([4, 5, 6]);
    expect(r.errors[0].error).toMatch(/introuvable/);
    await expectError(q(db, stranger, "select public.admin_import_duty('[]'::jsonb)"), /administrat/);
    const at = `${today}T12:00:00Z`;
    const rows = (await q(db, null, "select * from public.duty_pharmacies($1::timestamptz)", [at])).rows;
    expect(rows.map((x) => x.name).sort()).toEqual(["Pharmacie Test Un", "Pharmacie du Fleuve"]);
    expect(rows.find((x) => x.name === "Pharmacie Test Un").kind).toBe("verified");
    const c4 = (await q(db, null, "select name from public.duty_pharmacies($1::timestamptz, null, null, $2)", [at, w.c4])).rows;
    expect(c4.map((x) => x.name)).toEqual(["Pharmacie du Fleuve"]);
    // Planning sur 7 jours
    const week = (await q(db, null, "select count(*)::int as n from public.duty_pharmacies($1::timestamptz, $2::timestamptz)", [`${today}T00:00:00Z`, `${dayIn(7)}T00:00:00Z`])).rows[0].n;
    expect(week).toBe(2);
    // Aucune écriture directe
    await expectError(q(db, stranger, "delete from public.pharmacy_duty"), /permission denied/);
  });

  it("garde déclarée par la pharmacie : réservée à son équipe, supprimable par elle, pas par un tiers", async () => {
    const s = `${dayIn(2)}T20:00:00Z`, e = `${dayIn(3)}T08:00:00Z`;
    await expectError(q(db, stranger, "select public.pharmacy_declare_duty($1, $2, $3)", [w.ph2, s, e]), /équipe/);
    const id = (await q(db, w.ph2User, "select public.pharmacy_declare_duty($1, $2, $3) as id", [w.ph2, s, e])).rows[0].id;
    await expectError(q(db, w.ph2User, "select public.pharmacy_declare_duty($1, $2, $3)", [w.ph2, s, `${dayIn(20)}T08:00:00Z`]), /8 jours/);
    const row = (await q(db, null, "select status, source from public.duty_pharmacies($1::timestamptz) where duty_id = $2", [`${dayIn(2)}T22:00:00Z`, id])).rows[0];
    expect(row).toEqual({ status: "declared", source: "Déclarée par la pharmacie" });
    await expectError(q(db, w.ph1User, "select public.delete_duty($1)", [id]), /non autorisée/);
    await q(db, w.ph2User, "select public.delete_duty($1)", [id]);
    // Une garde confirmée par l'administration n'est pas supprimable par la pharmacie
    const conf = (await q(db, w.admin, "select public.admin_add_duty($1, null, $2, $3, 'Tableau Ordre') as id", [w.ph2, s, e])).rows[0].id;
    await expectError(q(db, w.ph2User, "select public.delete_duty($1)", [conf]), /non autorisée/);
  });

  it("laboratoires : import (non publiés possibles), catalogue d'examens, tarifs communiqués, tri par prix", async () => {
    const imp = (await q(db, w.admin, "select public.admin_import_facility_listings($1::jsonb) as r", [JSON.stringify([
      { line: 2, nom: "Laboratoire Alpha", type: "laboratoire", region: "Bamako", telephone: "20 22 00 01", telephone2: "76 00 11 22" },
      { line: 3, nom: "Laboratoire Beta", type: "laboratoire", region: "Bamako", telephone: "20 22 00 02" },
      { line: 4, nom: "Laboratoire À Confirmer", type: "laboratoire", region: "Bamako", publie: "non" },
      { line: 5, nom: "SAMU Test", type: "urgences", region: "Bamako", telephone: "20 22 00 03", urgences_24h: "oui" },
      { line: 6, nom: "Ambulances Test", type: "ambulance", telephone: "76 99 99 99" },
    ])])).rows[0].r;
    expect(imp.imported).toBe(5);
    const hidden = (await sys(db, "select is_published from public.facility_listings where name = 'Laboratoire À Confirmer'")).rows[0];
    expect(hidden.is_published).toBe(false);
    const exams = (await q(db, null, "select count(*)::int as n from public.medical_exams")).rows[0].n;
    expect(exams).toBeGreaterThan(25);
    const ex = (await q(db, w.admin, "select public.admin_import_facility_exams($1::jsonb) as r", [JSON.stringify([
      { line: 2, etablissement: "Laboratoire Alpha", examen: "nfs", prix: "5 000 FCFA", delai: "24 h" },
      { line: 3, etablissement: "laboratoire beta", examen: "Numération formule sanguine (NFS)", prix: "4000" },
      { line: 4, etablissement: "Laboratoire Beta", examen: "glycemie" },
      { line: 5, etablissement: "Laboratoire Gamma", examen: "nfs" },
      { line: 6, etablissement: "Laboratoire Beta", examen: "examen imaginaire" },
      { line: 7, etablissement: "Laboratoire À Confirmer", examen: "nfs", prix: "1000" },
    ])])).rows[0].r;
    expect(ex.imported).toBe(4);
    expect(ex.errors.map((e: { row: number }) => e.row)).toEqual([5, 6]);
    const nfs = (await sys(db, "select id from public.medical_exams where code = 'nfs'")).rows[0].id;
    const byPrice = (await q(db, null, "select name, price_xof, delay from public.search_labs($1, null, null, 'price')", [nfs])).rows;
    // Le laboratoire non publié n'apparaît pas
    expect(byPrice.map((x) => [x.name, x.price_xof])).toEqual([["Laboratoire Beta", 4000], ["Laboratoire Alpha", 5000]]);
    expect(byPrice[1].delay).toBe("24 h");
    const all = (await q(db, null, "select name from public.search_labs(null, 'alpha')")).rows;
    expect(all.map((x) => x.name)).toEqual(["Laboratoire Alpha"]);
    expect((await q(db, null, "select count(*)::int as n from public.facility_exams")).rows[0].n).toBe(3);
    await expectError(q(db, stranger, "select public.admin_import_facility_exams('[]'::jsonb)"), /administrat/);
  });

  it("répertoire d'urgence : services d'urgence et ambulances publiés", async () => {
    const rows = (await q(db, null, "select name, kind, verified from public.emergency_directory($1)", [w.region])).rows;
    expect(rows.map((x) => x.name).sort()).toEqual(["Ambulances Test", "SAMU Test"]);
    expect(rows.every((x) => x.verified === false)).toBe(true);
  });

  it("alertes : création (connecté, 10 max), notification unique au retour en stock dans la zone, signaux pour la pharmacie", async () => {
    const amox = w.amox1.catalogId;
    await expectError(q(db, null, "select public.create_medicine_alert($1)", [amox]), /connectez-vous|permission denied/);
    // Rupture chez ph1
    await q(db, w.ph1User, "select public.set_inventory($1, $2, 0, 2500, false)", [w.ph1, amox]);
    const a = (await q(db, w.customerA, "select public.create_medicine_alert($1, $2, $3) as id", [amox, w.region, w.c3])).rows[0].id;
    await q(db, w.customerB, "select public.create_medicine_alert($1, $2, $3)", [amox, w.region, w.c4]); // autre commune
    await q(db, stranger, "select public.create_medicine_alert($1)", [amox]); // tout le Mali
    // Re-création = mise à jour, pas de doublon
    await q(db, w.customerA, "select public.create_medicine_alert($1, $2, $3)", [amox, w.region, w.c3]);
    expect((await q(db, w.customerA, "select count(*)::int as n from public.medicine_alerts")).rows[0].n).toBe(1);
    expect((await q(db, w.customerB, "select count(*)::int as n from public.medicine_alerts where user_id <> $1", [w.customerB])).rows[0].n).toBe(0);
    // Signaux de demande pour ph2 (commune IV) : B + inconnu ; pour ph1 (commune III) : A + inconnu
    const sig1 = (await q(db, w.ph1User, "select label, waiting::int from public.pharmacy_demand_signals($1)", [w.ph1])).rows;
    expect(sig1).toEqual([{ label: "Amoxicilline Test 500 mg Gélule", waiting: 2 }]);
    await expectError(q(db, w.ph2User, "select * from public.pharmacy_demand_signals($1)", [w.ph1]), /équipe/);
    // Retour en stock chez ph1 (Commune III) → A et l'inconnu prévenus, pas B
    await q(db, w.ph1User, "select public.set_inventory($1, $2, 4, 2500, true)", [w.ph1, amox]);
    const notified = (await sys(db, "select user_id from public.notifications where kind = 'medicine_alert'")).rows.map((x) => x.user_id).sort();
    expect(notified).toEqual([w.customerA, stranger].sort());
    const body = (await sys(db, "select body, link from public.notifications where kind = 'medicine_alert' and user_id = $1", [w.customerA])).rows[0];
    expect(body.body).toMatch(/Pharmacie Test Un/);
    expect(body.link).toBe(`/pharmacies/${w.ph1}`);
    // Mise à jour de quantité alors que déjà disponible → pas de nouvelle notification
    await q(db, w.ph1User, "select public.set_inventory($1, $2, 8, 2500, true)", [w.ph1, amox]);
    expect((await sys(db, "select count(*)::int as n from public.notifications where kind = 'medicine_alert'")).rows[0].n).toBe(2);
    expect((await q(db, w.customerA, "select notified_at from public.medicine_alerts where id = $1", [a])).rows[0].notified_at).not.toBeNull();
    await expectError(q(db, w.customerB, "select public.delete_medicine_alert($1)", [a]), /introuvable/);
    await q(db, w.customerA, "select public.delete_medicine_alert($1)", [a]);
  });

  it("observatoire : agrégé, réservé à l'administration, recherches vides à partir de 3 occurrences", async () => {
    for (let i = 0; i < 3; i++) await sys(db, "insert into public.search_logs (query_normalized, region_id, result_count) values ('produit rare', $1, 0)", [w.region]);
    await sys(db, "insert into public.search_logs (query_normalized, region_id, result_count) values ('nom isole', $1, 0)", [w.region]);
    const o = (await q(db, w.admin, "select public.admin_shortage_observatory(30) as o")).rows[0].o;
    expect(o.searches.map((s: { recherche: string }) => s.recherche)).toEqual(["produit rare"]);
    expect(o.alerts.length).toBeGreaterThan(0);
    expect(JSON.stringify(o)).not.toMatch(/user_id|@/);
    await expectError(q(db, w.ph1User, "select public.admin_shortage_observatory(30)"), /administrat/);
  });

  it("maintenance : purge intégrée", async () => {
    const r = (await sys(db, "select public.run_maintenance() as r")).rows[0].r;
    expect(r.purged).toHaveProperty("services");
  });
});
