/**
 * Outils de test base de données.
 * Chaque fichier de test crée une base PostgreSQL vierge, y applique le shim
 * Supabase (tests/db/supabase-shim.sql) puis toutes les migrations, et
 * exécute les requêtes sous les rôles « anon » / « authenticated » avec les
 * claims JWT correspondants — exactement comme PostgREST le fait.
 *
 * Variable requise : PP_TEST_PG (ex. postgres://postgres@localhost:54322/postgres)
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";

export const PG_URL = process.env.PP_TEST_PG;
export const hasDb = Boolean(PG_URL);

const root = join(__dirname, "..", "..");

export type Db = {
  pool: pg.Pool;
  name: string;
  close: () => Promise<void>;
};

export async function createTestDb(): Promise<Db> {
  const admin = new pg.Client({ connectionString: PG_URL });
  await admin.connect();
  const name = `pp_t_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(PG_URL!);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 40 });

  const shim = readFileSync(join(root, "tests/db/supabase-shim.sql"), "utf8");
  await pool.query(shim);
  const dir = join(root, "supabase/migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await pool.query(readFileSync(join(dir, f), "utf8"));
  }

  return {
    pool,
    name,
    close: async () => {
      await pool.end();
      const c = new pg.Client({ connectionString: PG_URL });
      await c.connect();
      await c.query(`drop database if exists ${name} with (force)`);
      await c.end();
    },
  };
}

/** Exécute fn dans une transaction sous l'identité donnée (null = visiteur anonyme). */
export async function as<T>(db: Db, uid: string | null, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await db.pool.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${uid ? "authenticated" : "anon"}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(uid ? { sub: uid, role: "authenticated" } : { role: "anon" }),
    ]);
    const res = await fn(c);
    await c.query("commit");
    return res;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Raccourci : une requête sous une identité. */
export async function q<R extends pg.QueryResultRow = any>(db: Db, uid: string | null, sql: string, params: unknown[] = []) {
  return as(db, uid, (c) => c.query<R>(sql, params));
}

/** Requête en tant que propriétaire (équivalent service_role / éditeur SQL). */
export async function sys<R extends pg.QueryResultRow = any>(db: Db, sql: string, params: unknown[] = []) {
  return db.pool.query<R>(sql, params);
}

export async function createUser(db: Db, label: string, meta: Record<string, unknown> = {}) {
  const id = randomUUID();
  await sys(db, "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [
    id,
    `${label}-${id.slice(0, 6)}@test.local`,
    JSON.stringify({ full_name: label, ...meta }),
  ]);
  return id;
}

export async function regionId(db: Db, name = "District de Bamako") {
  return (await sys(db, "select id from public.regions where name = $1", [name])).rows[0].id as string;
}
export async function communeId(db: Db, name: string) {
  return (await sys(db, "select id from public.communes where name = $1", [name])).rows[0].id as string;
}

/** Monde de test : un admin, deux pharmacies vérifiées, deux clients, un livreur. */
export async function buildWorld(db: Db) {
  const admin = await createUser(db, "admin");
  await sys(db, "select public.bootstrap_admin(email) from auth.users where id = $1", [admin]);
  const ph1User = await createUser(db, "pharma1");
  const ph2User = await createUser(db, "pharma2");
  const customerA = await createUser(db, "clientA");
  const customerB = await createUser(db, "clientB");
  const courierUser = await createUser(db, "livreur");
  const otherCourier = await createUser(db, "livreur2");

  const region = await regionId(db);
  const c3 = await communeId(db, "Commune III");
  const c4 = await communeId(db, "Commune IV");

  const register = async (uid: string, name: string, commune: string, lat: number | null, lng: number | null) =>
    (
      await q(db, uid, "select public.register_pharmacy($1::jsonb) as id", [
        JSON.stringify({
          name,
          address: "Rue de test",
          region_id: region,
          commune_id: commune,
          phone: "+22370000000",
          pharmacist_in_charge: "Dr Test",
          latitude: lat,
          longitude: lng,
          offers_delivery: true,
          opening_hours: { mon: [["00:00", "24:00"]], tue: [["00:00", "24:00"]], wed: [["00:00", "24:00"]], thu: [["00:00", "24:00"]], fri: [["00:00", "24:00"]], sat: [["00:00", "24:00"]], sun: [["00:00", "24:00"]] },
        }),
      ])
    ).rows[0].id as string;

  const ph1 = await register(ph1User, "Pharmacie Test Un", c3, 12.64, -8.0);
  const ph2 = await register(ph2User, "Pharmacie Test Deux", c4, 12.6, -7.95);
  for (const [ph, u] of [
    [ph1, ph1User],
    [ph2, ph2User],
  ]) {
    await q(db, u, "insert into public.pharmacy_documents (pharmacy_id, doc_type, storage_path, uploaded_by) values ($1, 'autorisation_ouverture', $2, $3)", [
      ph,
      `${ph}/autorisation.pdf`,
      u,
    ]);
    await q(db, admin, "select public.admin_review_pharmacy($1, 'verified', null)", [ph]);
  }

  const categories = (await sys(db, "select id, name from public.product_categories")).rows as { id: string; name: string }[];
  const cat = (n: string) => categories.find((c) => c.name === n)!.id;

  const addProduct = async (pharmUser: string, pharmacy: string, product: Record<string, unknown>, qty: number, price: number) => {
    const cid = (await q(db, pharmUser, "select public.upsert_catalog_item($1::jsonb) as id", [JSON.stringify(product)])).rows[0].id as string;
    const inv = (await q(db, pharmUser, "select public.set_inventory($1, $2, $3, $4, true) as id", [pharmacy, cid, qty, price])).rows[0].id as string;
    return { catalogId: cid, inventoryId: inv };
  };

  const para1 = await addProduct(ph1User, ph1, { brand_name: "Paracétamol Test", active_ingredient: "Paracétamol", dosage: "500 mg", form: "Comprimé", category_id: cat("Médicaments sans ordonnance") }, 5, 500);
  const para2 = await addProduct(ph2User, ph2, { brand_name: "paracetamol test", dosage: "500 mg", form: "comprimé", category_id: cat("Médicaments sans ordonnance") }, 50, 450);
  const amox1 = await addProduct(ph1User, ph1, { brand_name: "Amoxicilline Test", dosage: "500 mg", form: "Gélule", category_id: cat("Médicaments sur ordonnance") }, 10, 2500);

  // Livreur vérifié
  await q(db, courierUser, "select public.courier_apply('+22376000000', 'moto', $1, null)", [region]);
  await q(db, admin, "select public.admin_review_courier($1, 'verified', null, 'CNI-TEST-1')", [courierUser]);
  await q(db, otherCourier, "select public.courier_apply('+22376000001', 'moto', $1, null)", [region]); // reste « pending »

  const addAddress = async (uid: string) =>
    (
      await q(db, uid, "insert into public.customer_addresses (user_id, region_id, commune_id, address_line, contact_phone) values ($1, $2, $3, 'Porte 12', '+22370101010') returning id", [
        uid,
        region,
        c3,
      ])
    ).rows[0].id as string;

  return {
    admin, ph1User, ph2User, customerA, customerB, courierUser, otherCourier,
    ph1, ph2, region, c3, c4, para1, para2, amox1, cat, addAddress,
    addressA: await addAddress(customerA),
  };
}

export type World = Awaited<ReturnType<typeof buildWorld>>;

export async function expectError(p: Promise<unknown>, pattern: RegExp) {
  try {
    await p;
  } catch (e: any) {
    if (!pattern.test(String(e?.message))) throw new Error(`Erreur inattendue : ${e?.message} (attendu ${pattern})`);
    return;
  }
  throw new Error(`Une erreur ${pattern} était attendue`);
}

export function key() {
  return `k-${randomUUID()}`;
}
