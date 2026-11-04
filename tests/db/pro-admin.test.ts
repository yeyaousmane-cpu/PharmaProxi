/** 0.22 : inscription réservée aux patients ; les professionnels sont ajoutés par l'administrateur. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, hasDb, q, regionId, sys, World } from "./helpers";

describe.skipIf(!hasDb)("Professionnels ajoutés par l'administrateur", () => {
  let db: Db;
  let w: World;
  let bamako: string;
  const email = async (uid: string) => (await sys(db, "select email from auth.users where id = $1", [uid])).rows[0].email as string;
  const pharmacy = (region: string) => JSON.stringify({
    name: "Pharmacie Essai", address: "Rue 10", region_id: region, phone: "+22320000001", pharmacist_in_charge: "Dr Essai",
    license_number: "ONP-0001", opening_hours: { mon: [["08:00", "20:00"]] }, offers_pickup: true, offers_delivery: false,
  });
  beforeAll(async () => { db = await createTestDb(); w = await buildWorld(db); bamako = await regionId(db); }, 120_000);
  afterAll(async () => db?.close());

  it("un patient ne peut pas s'inscrire comme pharmacien, médecin ou clinique", async () => {
    const p = await createUser(db, "patient-seul", {}, { pro: false });
    await expectError(q(db, p, "select public.register_pharmacy($1::jsonb)", [pharmacy(bamako)]), /administrateur doit d'abord/);
    await expectError(q(db, p, "select public.register_doctor($1::jsonb)", [JSON.stringify({ title: "Dr", display_name: "Dr Faux", gender: "homme", languages: ["fr"], consent: true })]), /administrateur doit d'abord/);
    await expectError(q(db, p, "select public.register_clinic($1::jsonb)", [JSON.stringify({ name: "Clinique Fausse", address: "Rue 1", region_id: bamako, phone: "+22320000000" })]), /administrateur doit d'abord/);
    expect((await sys(db, "select count(*)::int n from public.pharmacies where name = 'Pharmacie Essai'")).rows[0].n).toBe(0);
  });

  it("l'administrateur autorise un compte existant, qui peut alors inscrire sa pharmacie", async () => {
    const p = await createUser(db, "pharmacien-verifie", {}, { pro: false });
    await expectError(q(db, w.customerA, "select public.admin_authorize_pro($1, 'pharmacie')", [await email(p)]), /PP403|administrat/i);
    await expectError(q(db, w.admin, "select public.admin_authorize_pro('inconnu@test.invalid', 'pharmacie')"), /créer un compte patient/);
    await q(db, w.admin, "select public.admin_authorize_pro($1, 'pharmacie', 'Ordre : n° 1234 vérifié')", [await email(p)]);
    expect((await sys(db, "select account_type from public.profiles where id = $1", [p])).rows[0].account_type).toBe("pharmacien");
    expect((await sys(db, "select count(*)::int n from public.notifications where user_id = $1 and link = '/pharmacien/inscription'", [p])).rows[0].n).toBe(1);
    const id = (await q(db, p, "select public.register_pharmacy($1::jsonb) id", [pharmacy(bamako)])).rows[0].id;
    expect((await sys(db, "select status, public_code from public.pharmacies where id = $1", [id])).rows[0]).toMatchObject({ status: "pending", public_code: expect.stringMatching(/^SP-PH-/) });
    // une autorisation « pharmacie » ne permet pas de créer une fiche médecin
    await expectError(q(db, p, "select public.register_doctor($1::jsonb)", [JSON.stringify({ title: "Dr", display_name: "Dr X", gender: "homme", languages: ["fr"], consent: true })]), /administrateur doit d'abord/);
    await q(db, w.admin, "select public.admin_revoke_pro_authorization($1, 'pharmacie')", [p]);
    expect((await q(db, p, "select public.has_pro_authorization('pharmacie') ok")).rows[0].ok).toBe(false);
  });

  it("formulaire de contact professionnel : ouvert à tous, lisible par l'administrateur seulement", async () => {
    const req = { kind: "laboratoire", full_name: "Awa Traoré", structure: "Laboratoire Essai", region_id: bamako, phone: "+22370000000", authorization_ref: "Arrêté 2021-0042" };
    const id = (await q(db, null, "select public.submit_pro_contact($1) id", [req])).rows[0].id;
    await expectError(q(db, null, "select public.submit_pro_contact($1)", [{ ...req, phone: "123" }]), /check constraint|valid_phone|phone/);
    expect((await q(db, w.customerB, "select count(*)::int n from public.pro_contact_requests")).rows[0].n).toBe(0);
    expect((await q(db, w.admin, "select count(*)::int n from public.pro_contact_requests")).rows[0].n).toBe(1);
    await q(db, w.admin, "select public.admin_pro_contact_status($1, 'traitee', 'Rattaché au laboratoire')", [id]);
    expect((await sys(db, "select status from public.pro_contact_requests where id = $1", [id])).rows[0].status).toBe("traitee");
    await expectError(q(db, w.customerB, "select public.admin_pro_contact_status($1, 'refusee')", [id]), /PP403|administrat/i);
  });

  it("suppression du compte : autorisations effacées", async () => {
    const p = await createUser(db, "a-supprimer");
    await sys(db, "update public.profiles set deleted_at = now() where id = $1", [p]);
    expect((await sys(db, "select count(*)::int n from public.pro_authorizations where user_id = $1", [p])).rows[0].n).toBe(0);
  });
});
