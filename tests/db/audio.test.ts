/** Guides audio : dépôt réservé à l'équipe, publication après relecture, lecture publique des seuls enregistrements publiés. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, hasDb, q, World } from "./helpers";

describe.skipIf(!hasDb)("Guides audio", () => {
  let db: Db;
  let w: World;
  let stranger: string;
  beforeAll(async () => {
    db = await createTestDb();
    w = await buildWorld(db);
    stranger = await createUser(db, "visiteur");
  }, 120_000);
  afterAll(async () => db?.close());

  const reg = (uid: string, lang: string, path: string, reviewer: string | null = null) =>
    q(db, uid, "select public.audio_register_clip('accueil', $1, $2, 'audio/mpeg', 120000, 42, 'Awa', 'Moussa', $3) as old", [lang, path, reviewer]).then((r) => r.rows[0].old);

  it("langues et pages publiques ; dépôt refusé hors équipe", async () => {
    expect((await q(db, null, "select count(*)::int as n from public.audio_languages")).rows[0].n).toBe(14);
    expect((await q(db, null, "select script_fr from public.audio_targets where key = 'urgences'")).rows[0].script_fr).toMatch(/service d'urgence/);
    await expectError(reg(stranger, "bambara", "accueil/bambara-1.mp3"), /équipe PharmaProxi/);
    await expectError(reg(w.admin, "klingon", "accueil/x.mp3"), /langue inconnue/);
    await expectError(q(db, w.admin, "select public.audio_register_clip('accueil', 'bambara', 'a/b.mp3', 'video/mp4', 100, null, null, null, null)"), /format/);
  });

  it("brouillon invisible, publication exigeant une relecture, remplacement qui renvoie l'ancien fichier", async () => {
    expect(await reg(w.admin, "bambara", "accueil/bambara-1.mp3")).toBeNull();
    const id = (await q(db, w.admin, "select id from public.audio_clips where lang = 'bambara'")).rows[0].id;
    expect((await q(db, null, "select count(*)::int as n from public.audio_clips")).rows[0].n).toBe(0);
    await expectError(q(db, w.admin, "select public.audio_set_published($1, true)", [id]), /vérifié la traduction/);
    expect(await reg(w.admin, "bambara", "accueil/bambara-2.mp3", "Fanta")).toBe("accueil/bambara-1.mp3");
    const id2 = (await q(db, w.admin, "select id from public.audio_clips where lang = 'bambara'")).rows[0].id;
    await q(db, w.admin, "select public.audio_set_published($1, true)", [id2]);
    const pub = (await q(db, null, "select lang, storage_path, speaker from public.audio_clips")).rows;
    expect(pub).toEqual([{ lang: "bambara", storage_path: "accueil/bambara-2.mp3", speaker: "Awa" }]);
    // Français : pas de relecture exigée
    await reg(w.admin, "francais", "accueil/francais-1.mp3");
    const fr = (await q(db, w.admin, "select id from public.audio_clips where lang = 'francais'")).rows[0].id;
    await q(db, w.admin, "select public.audio_set_published($1, true)", [fr]);
    await expectError(q(db, stranger, "select public.audio_delete_clip($1)", [fr]), /équipe PharmaProxi/);
    expect((await q(db, w.admin, "select public.audio_delete_clip($1) as p", [fr])).rows[0].p).toBe("accueil/francais-1.mp3");
  });

  it("ajout d'une page à enregistrer (fiche santé)", async () => {
    await q(db, w.admin, "select public.audio_save_target('fiche:paludisme', 'Paludisme', '/sante/fiche/paludisme', 'Le paludisme se transmet par la piqûre de moustique.')");
    expect((await q(db, null, "select label from public.audio_targets where key = 'fiche:paludisme'")).rows[0].label).toBe("Paludisme");
    await expectError(q(db, w.admin, "select public.audio_save_target('X Y', 'a', 'pas-une-adresse', 'court')"), /vérifiez/);
    await expectError(q(db, stranger, "select public.audio_save_target('fiche:x', 'Titre', '/x', 'Un texte assez long pour passer.')"), /équipe PharmaProxi/);
  });
});
