/**
 * Annuaire des médecins spécialistes et des cliniques (module M7).
 * Vérifie le cycle de référencement, la publication conditionnelle (vérification,
 * consentement, double acceptation, fraîcheur), la recherche et le cloisonnement.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, hasDb, q, sys, World } from "./helpers";

const WEEK = { mon: [["08:00", "12:00"]], wed: [["15:00", "18:00"]] };

describe.skipIf(!hasDb)("Annuaire médical", () => {
  let db: Db;
  let w: World;
  let spec: Record<string, string>;
  let docUser: string, docUser2: string, clinicUser: string, clinicStaff: string;
  let doctor: string, doctor2: string, clinic: string;

  const regDoctor = (uid: string, p: Record<string, unknown>) =>
    q(db, uid, "select public.register_doctor($1::jsonb) as id", [JSON.stringify(p)]).then((r) => r.rows[0].id as string);
  const addDoc = (uid: string, id: string, kind: "doctor" | "clinic") =>
    kind === "doctor"
      ? q(db, uid, "insert into public.doctor_documents (doctor_id, doc_type, storage_path, uploaded_by) values ($1, 'inscription_ordre', $2, $3)", [id, `doctor/${id}/ordre.pdf`, uid])
      : q(db, uid, "insert into public.clinic_documents (clinic_id, doc_type, storage_path, uploaded_by) values ($1, 'autorisation_ouverture', $2, $3)", [id, `clinic/${id}/auto.pdf`, uid]);
  const DOC_CHECK = { ordre: true, diplome: true, identite: true, lieu: true, telephone: true };
  const CLI_CHECK = { autorisation: true, existence_legale: true, responsable: true, adresse: true, telephone: true };

  beforeAll(async () => {
    db = await createTestDb();
    w = await buildWorld(db);
    spec = Object.fromEntries((await sys(db, "select code, id from public.medical_specialties")).rows.map((r) => [r.code, r.id]));
    docUser = await createUser(db, "docteur");
    docUser2 = await createUser(db, "docteur2");
    clinicUser = await createUser(db, "clinique");
    clinicStaff = await createUser(db, "secretaire");
  }, 120_000);
  afterAll(async () => db?.close());

  it("le référencement exige le consentement, le numéro d'Ordre et au moins une spécialité", async () => {
    await expectError(regDoctor(docUser, { display_name: "Awa Diallo", order_number: "ML-1", specialties: [spec.cardiologie] }), /accord pour la publication/);
    await expectError(regDoctor(docUser, { display_name: "Awa Diallo", consent: true, specialties: [spec.cardiologie] }), /Ordre des médecins/);
    await expectError(regDoctor(docUser, { display_name: "Awa Diallo", consent: true, order_number: "ML-1", specialties: [] }), /au moins une spécialité/);
    await expectError(
      regDoctor(docUser, { display_name: "Awa Diallo", consent: true, order_number: "ML-1", specialties: [spec.cardiologie, spec.pediatrie, spec.orl, spec.dermatologie, spec.neurologie] }),
      /4 spécialités maximum/,
    );
    doctor = await regDoctor(docUser, {
      title: "Dr", display_name: "Awa Diallo", gender: "F", consent: true, order_number: "ML-1234", languages: ["fr", "bm"], specialties: [spec.cardiologie],
    });
    await expectError(regDoctor(docUser, { display_name: "Encore", consent: true, order_number: "X", specialties: [spec.cardiologie] }), /existe déjà/);
    doctor2 = await regDoctor(docUser2, { display_name: "Moussa Traoré", gender: "M", consent: true, order_number: "ML-99", languages: ["fr", "snk"], specialties: [spec.pediatrie] });
  });

  it("une fiche en attente n'est visible que de son titulaire et de l'administration", async () => {
    expect((await q(db, null, "select id from public.doctors")).rowCount).toBe(0);
    expect((await q(db, w.customerA, "select id from public.doctors")).rowCount).toBe(0);
    expect((await q(db, docUser, "select id from public.doctors")).rows.map((r) => r.id)).toEqual([doctor]);
    expect((await q(db, w.admin, "select id from public.doctors")).rowCount).toBe(2);
  });

  it("les données privées et les justificatifs restent cloisonnés", async () => {
    await expectError(q(db, null, "select * from public.doctor_private"), /permission denied/);
    expect((await q(db, docUser2, "select * from public.doctor_private where doctor_id = $1", [doctor])).rowCount).toBe(0);
    expect((await q(db, docUser, "select order_number from public.doctor_private")).rows[0].order_number).toBe("ML-1234");
    // Dépôt sous le chemin d'un autre médecin refusé
    await expectError(
      q(db, docUser2, "insert into public.doctor_documents (doctor_id, doc_type, storage_path, uploaded_by) values ($1, 'autre', $2, $3)", [doctor, `doctor/${doctor}/x.pdf`, docUser2]),
      /row-level security/,
    );
    // Aucune écriture directe sur les fiches
    await expectError(q(db, docUser, "update public.doctors set status = 'verified' where id = $1", [doctor]), /permission denied/);
    await expectError(q(db, docUser, "insert into public.doctor_specialties values ($1, $2)", [doctor, spec.orl]), /permission denied/);
  });

  it("la validation administrative exige un justificatif et les 5 points de contrôle", async () => {
    await expectError(q(db, docUser, "select public.admin_review_doctor($1, 'verified')", [doctor]), /réservée à l'administration/);
    await expectError(q(db, w.admin, "select public.admin_review_doctor($1, 'verified', null, $2::jsonb)", [doctor, JSON.stringify(DOC_CHECK)]), /aucun justificatif/);
    await addDoc(docUser, doctor, "doctor");
    await expectError(q(db, w.admin, "select public.admin_review_doctor($1, 'verified', null, '{\"ordre\":true}'::jsonb)", [doctor]), /5 points de contrôle/);
    await expectError(q(db, w.admin, "select public.admin_review_doctor($1, 'rejected', '')", [doctor]), /motif est obligatoire/);
    await q(db, w.admin, "select public.admin_review_doctor($1, 'verified', null, $2::jsonb)", [doctor, JSON.stringify(DOC_CHECK)]);
    await addDoc(docUser2, doctor2, "doctor");
    await q(db, w.admin, "select public.admin_review_doctor($1, 'verified', null, $2::jsonb)", [doctor2, JSON.stringify(DOC_CHECK)]);
    const notif = await q(db, docUser, "select title from public.notifications where kind = 'directory_review'");
    expect(notif.rows[0].title).toMatch(/publiée/);
    expect((await q(db, null, "select id from public.doctors order by display_name")).rows.map((r) => r.id)).toEqual([doctor, doctor2]);
  });

  it("une clinique s'inscrit, dépose ses pièces et est validée", async () => {
    await expectError(
      q(db, clinicUser, "select public.register_clinic($1::jsonb)", [JSON.stringify({ name: "Clinique X", address: "Rue 1", region_id: w.region, phone: "+22320000000" })]),
      /responsable est obligatoire/,
    );
    clinic = (
      await q(db, clinicUser, "select public.register_clinic($1::jsonb) as id", [
        JSON.stringify({
          name: "Clinique Test Soleil", kind: "clinique", address: "Rue du fleuve", region_id: w.region, commune_id: w.c3, phone: "+22320000000",
          manager_name: "M. Responsable", latitude: 12.641, longitude: -8.001, emergency_24h: true, services: ["laboratoire", "imagerie", "inconnu"],
          opening_hours: { mon: [["08:00", "18:00"]] },
        }),
      ])
    ).rows[0].id;
    expect((await q(db, null, "select id from public.clinics")).rowCount).toBe(0);
    expect((await sys(db, "select services from public.clinics where id = $1", [clinic])).rows[0].services).toEqual(["imagerie", "laboratoire"]);
    await addDoc(clinicUser, clinic, "clinic");
    await q(db, w.admin, "select public.admin_review_clinic($1, 'verified', null, $2::jsonb)", [clinic, JSON.stringify(CLI_CHECK)]);
    expect((await q(db, null, "select name from public.clinics")).rows[0].name).toBe("Clinique Test Soleil");
    await expectError(q(db, null, "select * from public.clinic_private"), /permission denied/);
    // Équipe : le secrétariat rejoint la clinique
    const email = (await sys(db, "select email from auth.users where id = $1", [clinicStaff])).rows[0].email;
    await q(db, clinicUser, "select public.clinic_add_member($1, $2)", [clinic, email]);
    await expectError(q(db, clinicStaff, "select public.clinic_add_member($1, $2)", [clinic, email]), /seul le responsable/);
  });

  it("un lieu d'exercice n'est publié qu'après acceptation des deux parties", async () => {
    await expectError(q(db, docUser, "select public.doctor_propose_site($1, '{}'::jsonb)", [clinic]), /au moins un jour/);
    await expectError(q(db, docUser, "select public.doctor_propose_site($1, '{\"mon\":[[\"12:00\",\"08:00\"]]}'::jsonb)", [clinic]), /au moins un jour/);
    const site = (await q(db, docUser, "select public.doctor_propose_site($1, $2::jsonb, '+22376543210') as id", [clinic, JSON.stringify(WEEK)])).rows[0].id;
    expect((await q(db, null, "select id from public.doctor_practice_sites")).rowCount).toBe(0);
    // La clinique voit la demande et le médecin (même s'il n'est lié que par cette demande)
    expect((await q(db, clinicStaff, "select clinic_accepted from public.doctor_practice_sites where id = $1", [site])).rows[0].clinic_accepted).toBe(false);
    expect((await q(db, clinicUser, "select title from public.notifications where kind = 'directory_site'")).rowCount).toBe(1);
    // Un tiers ne peut ni accepter ni modifier
    await expectError(q(db, docUser2, "select public.accept_practice_site($1)", [site]), /accès refusé/);
    await expectError(q(db, docUser2, "select public.update_practice_site($1, $2::jsonb)", [site, JSON.stringify(WEEK)]), /accès refusé/);
    await q(db, clinicStaff, "select public.accept_practice_site($1)", [site]);
    expect((await q(db, null, "select id from public.doctor_practice_sites")).rows.map((r) => r.id)).toEqual([site]);
    // Invitation par la clinique : seul un médecin vérifié peut être invité, et il doit accepter
    const invited = (await q(db, clinicUser, "select public.clinic_invite_doctor($1, $2, $3::jsonb) as id", [clinic, doctor2, JSON.stringify({ tue: [["09:00", "13:00"]] })])).rows[0].id;
    expect((await q(db, null, "select id from public.doctor_practice_sites where id = $1", [invited])).rowCount).toBe(0);
    await q(db, docUser2, "select public.accept_practice_site($1)", [invited]);
    expect((await q(db, null, "select id from public.doctor_practice_sites where id = $1", [invited])).rowCount).toBe(1);
  });

  it("la recherche filtre par spécialité, zone, jour, langue et nom (fautes tolérées)", async () => {
    const s = async (args: string, params: unknown[] = []) =>
      (await q(db, null, `select * from public.search_doctors(${args})`, params)).rows.map((r) => r.display_name);
    expect(await s("p_specialty => $1", [spec.cardiologie])).toEqual(["Awa Diallo"]);
    expect(await s("p_query => 'cardiolgie'")).toEqual(["Awa Diallo"]);
    expect(await s("p_query => 'traore'")).toEqual(["Moussa Traoré"]);
    expect(await s("p_query => 'soleil'")).toEqual(["Awa Diallo", "Moussa Traoré"]);
    expect(await s("p_region => $1", [w.region])).toHaveLength(2);
    expect(await s("p_commune => $1", [w.c4])).toEqual([]);
    expect(await s("p_day => 'wed'")).toEqual(["Awa Diallo"]);
    expect(await s("p_day => 'tue'")).toEqual(["Moussa Traoré"]);
    expect(await s("p_language => 'snk'")).toEqual(["Moussa Traoré"]);
    expect(await s("p_gender => 'F'")).toEqual(["Awa Diallo"]);
    const row = (await q(db, null, "select * from public.search_doctors(p_specialty => $1, p_lat => 12.64, p_lng => -8.0)", [spec.cardiologie])).rows[0];
    expect(row.sites[0].clinic_name).toBe("Clinique Test Soleil");
    expect(row.sites[0].phone).toBe("+22376543210");
    expect(row.distance_km).toBeLessThan(1);
    expect(row.freshness).toBe("fresh");
    // Recherches journalisées sans identifiant
    const logs = await sys(db, "select query_normalized, result_count from public.search_logs where kind = 'doctor' order by id");
    expect(logs.rows.some((r) => r.query_normalized === "cardiolgie" && r.result_count === 1)).toBe(true);
  });

  it("« consulte aujourd'hui » tient compte du planning et des absences", async () => {
    const today = (await sys(db, "select public.day_key() as d")).rows[0].d as string;
    const docToday = await createUser(db, "docAujourdhui");
    const did = await regDoctor(docToday, { display_name: "Fatou Keita", consent: true, order_number: "ML-5", specialties: [spec.orl] });
    await addDoc(docToday, did, "doctor");
    await q(db, w.admin, "select public.admin_review_doctor($1, 'verified', null, $2::jsonb)", [did, JSON.stringify(DOC_CHECK)]);
    const site = (await q(db, docToday, "select public.doctor_propose_site($1, $2::jsonb) as id", [clinic, JSON.stringify({ [today]: [["08:00", "12:00"]] })])).rows[0].id;
    await q(db, clinicUser, "select public.accept_practice_site($1)", [site]);
    const todayNames = async () => (await q(db, null, "select display_name from public.search_doctors(p_today => true)")).rows.map((r) => r.display_name);
    expect(await todayNames()).toContain("Fatou Keita");
    await expectError(q(db, docToday, "select public.add_doctor_absence(current_date + 3, current_date + 1)"), /dates d'absence invalides/);
    const abs = (await q(db, docToday, "select public.add_doctor_absence(current_date, current_date + 7, 'Congé') as id")).rows[0].id;
    expect(await todayNames()).not.toContain("Fatou Keita");
    const r = (await q(db, null, "select absent_until from public.search_doctors(p_query => 'keita')")).rows[0];
    expect(r.absent_until).toBeTruthy();
    await expectError(q(db, docUser, "select public.remove_doctor_absence($1)", [abs]), /introuvable/);
    await q(db, docToday, "select public.remove_doctor_absence($1)", [abs]);
    expect(await todayNames()).toContain("Fatou Keita");
  });

  it("le médecin peut se retirer de l'annuaire et y revenir, avec effet immédiat", async () => {
    await q(db, docUser2, "select public.set_doctor_published(false)");
    expect((await q(db, null, "select id from public.doctors where id = $1", [doctor2])).rowCount).toBe(0);
    expect((await q(db, null, "select * from public.search_doctors(p_query => 'traore')")).rowCount).toBe(0);
    // Son lieu d'exercice n'est plus public non plus
    expect((await q(db, null, "select id from public.doctor_practice_sites where doctor_id = $1", [doctor2])).rowCount).toBe(0);
    await q(db, docUser2, "select public.set_doctor_published(true)");
    expect((await q(db, null, "select * from public.search_doctors(p_query => 'traore')")).rowCount).toBe(1);
  });

  it("une fiche non confirmée est signalée à 90 jours puis retirée à 180 jours, avec rappel", async () => {
    await sys(db, "update public.doctors set confirmed_at = now() - interval '100 days' where id = $1", [doctor]);
    expect((await q(db, null, "select freshness from public.search_doctors(p_specialty => $1)", [spec.cardiologie])).rows[0].freshness).toBe("to_confirm");
    await sys(db, "update public.doctors set confirmed_at = now() - interval '200 days' where id = $1", [doctor]);
    expect((await q(db, null, "select * from public.search_doctors(p_specialty => $1)", [spec.cardiologie])).rowCount).toBe(0);
    expect((await q(db, null, "select id from public.doctors where id = $1", [doctor])).rowCount).toBe(0);
    const run = (await sys(db, "select public.run_maintenance() as r")).rows[0].r;
    expect(run.purged.directory_reminders).toBeGreaterThanOrEqual(1);
    expect((await q(db, docUser, "select id from public.notifications where kind = 'directory_confirm'")).rowCount).toBe(1);
    // Pas de second rappel immédiat
    await sys(db, "select public.run_maintenance()");
    expect((await q(db, docUser, "select id from public.notifications where kind = 'directory_confirm'")).rowCount).toBe(1);
    await q(db, docUser, "select public.confirm_doctor_info()");
    expect((await q(db, null, "select freshness from public.search_doctors(p_specialty => $1)", [spec.cardiologie])).rows[0].freshness).toBe("fresh");
  });

  it("la recherche de cliniques filtre par urgences et spécialités présentes", async () => {
    const r = (await q(db, null, "select * from public.search_clinics(p_emergency => true)")).rows;
    expect(r.map((c) => c.name)).toEqual(["Clinique Test Soleil"]);
    expect(r[0].doctors_count).toBe("3");
    expect(r[0].specialties.map((s: { name: string }) => s.name).sort()).toEqual(["Cardiologie", "ORL", "Pédiatrie"]);
    expect((await q(db, null, "select * from public.search_clinics(p_specialty => $1)", [spec.psychiatrie])).rowCount).toBe(0);
    const near = (await q(db, null, "select * from public.nearby_pharmacies(12.641, -8.001)")).rows;
    expect(near[0].name).toBe("Pharmacie Test Un");
  });

  it("une suspension retire immédiatement la fiche et ses lieux de l'annuaire", async () => {
    await expectError(q(db, w.admin, "select public.admin_review_clinic($1, 'suspended', null)", [clinic]), /motif est obligatoire/);
    await q(db, w.admin, "select public.admin_review_clinic($1, 'suspended', 'Contrôle en cours')", [clinic]);
    expect((await q(db, null, "select id from public.clinics")).rowCount).toBe(0);
    expect((await q(db, null, "select * from public.search_doctors(p_specialty => $1)", [spec.cardiologie])).rows[0].sites).toEqual([]);
    await expectError(q(db, clinicUser, "select public.confirm_clinic_info($1)", [clinic]), /accès refusé/);
    // Le contrôle d'intégrité signale les lieux acceptés vers une clinique suspendue
    const issues = (await q(db, w.admin, "select * from public.admin_integrity_report()")).rows;
    expect(issues.some((i) => i.check_name === "site_without_verified_parties")).toBe(true);
    await q(db, w.admin, "select public.admin_review_clinic($1, 'verified', 'Contrôle terminé')", [clinic]);
    expect((await q(db, null, "select id from public.clinics")).rowCount).toBe(1);
  });

  it("les signalements visant un médecin sont visibles du médecin concerné et de l'administration", async () => {
    await q(db, w.customerA, "insert into public.reports (reporter_id, doctor_id, reason, description) values ($1, $2, 'numero_errone', 'Le numéro ne répond pas')", [w.customerA, doctor]);
    expect((await q(db, docUser, "select reason from public.reports")).rows[0].reason).toBe("numero_errone");
    expect((await q(db, docUser2, "select id from public.reports")).rowCount).toBe(0);
    expect((await q(db, w.admin, "select id from public.reports where doctor_id = $1", [doctor])).rowCount).toBe(1);
  });

  it("l'administration transfère la titularité d'une pharmacie, avec motif et trace", async () => {
    const newOwner = await createUser(db, "nouveauTitulaire");
    const email = (await sys(db, "select email from auth.users where id = $1", [newOwner])).rows[0].email;
    await expectError(q(db, w.ph1User, "select public.admin_transfer_pharmacy_owner($1, $2, 'x')", [w.ph1, email]), /réservée à l'administration/);
    await expectError(q(db, w.admin, "select public.admin_transfer_pharmacy_owner($1, $2, '')", [w.ph1, email]), /motif est obligatoire/);
    await q(db, w.admin, "select public.admin_transfer_pharmacy_owner($1, $2, 'Départ du titulaire, pièces vérifiées')", [w.ph1, email]);
    const members = (await sys(db, "select user_id, member_role from public.pharmacy_members where pharmacy_id = $1", [w.ph1])).rows;
    expect(members.find((m) => m.user_id === newOwner)?.member_role).toBe("owner");
    expect(members.find((m) => m.user_id === w.ph1User)?.member_role).toBe("staff");
    expect((await sys(db, "select role from public.user_roles where user_id = $1", [newOwner])).rows.map((r) => r.role)).toContain("pharmacist");
    expect((await sys(db, "select count(*)::int n from public.audit_logs where action = 'pharmacy.owner_transfer'")).rows[0].n).toBe(1);
  });

  it("la liste de stock est paginée en base et réservée aux membres de la pharmacie", async () => {
    const page = (uid: string, view = "tous", query: string | null = null, limit = 100, offset = 0) =>
      q(db, uid, "select * from public.pharmacy_stock_page($1, $2, $3, $4, $5)", [w.ph1, view, query, limit, offset]).then((r) => r.rows);
    await expectError(page(w.ph2User), /accès refusé/);
    await expectError(page(w.customerA), /accès refusé/);
    const all = await page(w.ph1User);
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(Number(all[0].total_count)).toBe(all.length);
    const first = await page(w.ph1User, "tous", null, 1, 0);
    expect(first).toHaveLength(1);
    expect(Number(first[0].total_count)).toBe(all.length);
    expect((await page(w.ph1User, "tous", "amoxi")).map((r) => r.brand_name)).toEqual(["Amoxicilline Test"]);
    await sys(db, "update public.pharmacy_inventory set stock_updated_at = now() - interval '5 days' where id = $1", [w.amox1.inventoryId]);
    expect((await page(w.ph1User, "anciens")).map((r) => r.id)).toContain(w.amox1.inventoryId);
    expect((await page(w.ph1User, "anciens"))[0].freshness).toBe("stale");
  });

  it("annuaire de démonstration : installé et supprimé sans toucher aux fiches réelles", async () => {
    const ids: Record<string, string> = {};
    for (const r of ["doctor1", "doctor2", "clinic"]) ids[r] = await createUser(db, `demo-${r}`);
    await expectError(q(db, w.admin, "select public.demo_directory_install('{}'::jsonb)"), /permission denied/);
    await sys(db, "set role service_role");
    try {
      await sys(db, "select public.demo_directory_install($1::jsonb)", [JSON.stringify(ids)]);
    } finally {
      await sys(db, "reset role");
    }
    const names = (await q(db, null, "select display_name from public.search_doctors(p_query => 'demo')")).rows.map((r) => r.display_name);
    expect(names.every((n) => n.startsWith("Démo"))).toBe(true);
    expect(names).toHaveLength(2);
    const before = (await sys(db, "select count(*)::int n from public.doctors where not is_demo")).rows[0].n;
    const res = (await sys(db, "select public.demo_directory_uninstall() as r")).rows[0].r;
    expect(res).toEqual({ doctors_deleted: 2, clinics_deleted: 2 });
    expect((await sys(db, "select count(*)::int n from public.doctors where not is_demo")).rows[0].n).toBe(before);
  });
});
