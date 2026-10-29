/** Annonces aux inscrits et bienvenue : notifications, e-mails à envoyer, jamais deux fois la bienvenue. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, hasDb, q, sys, World } from "./helpers";

describe.skipIf(!hasDb)("Annonces", () => {
  let db: Db;
  let w: World;
  beforeAll(async () => {
    db = await createTestDb();
    w = await buildWorld(db);
  }, 120_000);
  afterAll(async () => db?.close());

  const welcomeCount = async (uid: string) =>
    (await sys(db, "select count(*)::int as n from public.notifications where user_id = $1 and kind = 'welcome'", [uid])).rows[0].n;

  it("chaque nouvel inscrit reçoit la bienvenue dans son compte (sauf comptes de démonstration)", async () => {
    const u = await createUser(db, "nouveau");
    expect(await welcomeCount(u)).toBe(1);
    const demo = await createUser(db, "x");
    await sys(db, "update auth.users set email = 'demo.x@pharmaproxi.invalid' where id = $1", [demo]);
    const demo2 = await sys(db, "insert into auth.users (id, email) values (gen_random_uuid(), 'demo.y@pharmaproxi.invalid') returning id");
    expect(await welcomeCount(demo2.rows[0].id)).toBe(0);
  });

  it("bienvenue envoyée par l'administration : pas de doublon de notification ni d'e-mail", async () => {
    const send = () => q(db, w.admin, "select public.admin_send_announcement('Bienvenue sur PharmaProxi !', 'Merci de votre inscription, bonne expérience.', '/', 'tous', true, 'welcome') as r").then((r) => r.rows[0].r);
    const r1 = await send();
    expect(r1.count).toBe(0); // tout le monde a déjà la notification (déclencheur)
    expect(r1.recipients.length).toBeGreaterThan(5); // mais personne n'a encore reçu l'e-mail
    expect(r1.recipients.every((x: { email: string }) => !x.email.endsWith("@pharmaproxi.invalid"))).toBe(true);
    await q(db, w.admin, "select public.admin_announcement_email_result($1, $2, 0, $3::uuid[])", [r1.id, r1.recipients.length, r1.recipients.map((x: { id: string }) => x.id)]);
    const r2 = await send();
    expect(r2.recipients).toEqual([]);
    expect(await welcomeCount(w.customerA)).toBe(1);
  });

  it("annonce ciblée : notification à chaque destinataire, réservée à l'administration", async () => {
    const r = (await q(db, w.admin, "select public.admin_send_announcement('Nouveauté', 'Les pharmacies de garde sont en ligne.', '/garde', 'pharmaciens', false) as r")).rows[0].r;
    expect(r.count).toBe(2);
    expect(r.recipients).toEqual([]); // pas d'e-mail demandé
    const n = (await sys(db, "select count(*)::int as n from public.notifications where kind = 'announcement' and link = '/garde'")).rows[0].n;
    expect(n).toBe(2);
    await expectError(q(db, w.customerA, "select public.admin_send_announcement('Spam', 'Message non autorisé ici.', null, 'tous', true)"), /administrat/);
    await expectError(q(db, w.admin, "select public.admin_send_announcement('Lien', 'Message avec un lien externe.', 'https://exemple.com', 'tous', false)"), /lien interne/);
    expect((await q(db, w.customerA, "select count(*)::int as n from public.announcements")).rows[0].n).toBe(0);
  });
});
