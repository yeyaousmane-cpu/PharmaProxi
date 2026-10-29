/** Formulaire de contact : envoi anonyme ou connecté, contrôles, boîte de réception de l'administration. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, hasDb, q, sys, World } from "./helpers";

describe.skipIf(!hasDb)("Contact", () => {
  let db: Db;
  let w: World;
  let stranger: string;
  beforeAll(async () => {
    db = await createTestDb();
    w = await buildWorld(db);
    stranger = await createUser(db, "visiteur");
  }, 120_000);
  afterAll(async () => db?.close());

  it("envoi sans compte, contrôles, notification des administrateurs, lecture réservée à l'administration", async () => {
    const send = (uid: string | null, email: string | null, phone: string | null, msg = "Bonjour, la pharmacie X est fermée.") =>
      q(db, uid, "select public.send_contact_message('erreur', 'Awa', $1, $2, $3, '/pharmacies') as id", [email, phone, msg]);
    const id = (await send(null, "awa@example.org", null)).rows[0].id;
    await expectError(send(null, null, null), /e-mail ou un téléphone/);
    await expectError(send(null, null, "12"), /téléphone invalide/);
    await expectError(send(null, "awa@example.org", null, "court"), /trop court/);
    await expectError(send(null, "pas-un-email", null), /vérifiez les informations/);
    await send(stranger, null, "76 12 34 56");
    const notif = (await sys(db, "select count(*)::int as n from public.notifications where kind = 'contact' and user_id = $1", [w.admin])).rows[0].n;
    expect(notif).toBe(2);
    expect((await q(db, stranger, "select count(*)::int as n from public.contact_messages")).rows[0].n).toBe(0);
    expect((await q(db, null, "select count(*)::int as n from public.contact_messages")).rowCount).toBe(1);
    expect((await q(db, w.admin, "select count(*)::int as n from public.contact_messages")).rows[0].n).toBe(2);
    const row = (await q(db, w.admin, "select phone, user_id from public.contact_messages where user_id is not null")).rows[0];
    expect(row).toEqual({ phone: "+22376123456", user_id: stranger });
    await expectError(q(db, stranger, "select public.admin_update_contact_message($1, 'closed')", [id]), /administrat/);
    await q(db, w.admin, "select public.admin_update_contact_message($1, 'closed', 'Rappelée le 29/10')", [id]);
    expect((await q(db, w.admin, "select status, admin_note from public.contact_messages where id = $1", [id])).rows[0]).toEqual({ status: "closed", admin_note: "Rappelée le 29/10" });
    await expectError(q(db, null, "insert into public.contact_messages (topic, name, email, message) values ('autre', 'X', 'x@y.z', 'xxxxxxxxxxxx')"), /permission denied/);
  });

  it("anti-abus : 5 messages par heure pour un même contact", async () => {
    for (let i = 0; i < 4; i++) await q(db, null, "select public.send_contact_message('autre', 'Robot', 'spam@example.org', null, 'Message numéro ' || $1::text)", [i]);
    await q(db, null, "select public.send_contact_message('autre', 'Robot', 'spam@example.org', null, 'Message numéro 5')");
    await expectError(q(db, null, "select public.send_contact_message('autre', 'Robot', 'spam@example.org', null, 'Message numéro 6')"), /trop de messages/);
  });
});
