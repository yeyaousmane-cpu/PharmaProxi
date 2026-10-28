#!/usr/bin/env node
/**
 * Installation / suppression des données de démonstration PharmaProxi.
 *   npm run demo:install    — crée 8 comptes de démonstration + données fictives (pharmacies et annuaire)
 *   npm run demo:uninstall  — supprime toutes les données marquées « démo » et les comptes
 *
 * Nécessite NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (.env.local).
 * Refuse de s'exécuter si APP_ENV=production.
 */
import { readFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const cmd = process.argv[2];
if (!["install", "uninstall"].includes(cmd)) {
  console.error("Usage : node scripts/demo.mjs install|uninstall");
  process.exit(1);
}
if ((process.env.APP_ENV ?? "").toLowerCase() === "production") {
  console.error("Refusé : APP_ENV=production. Les données de démonstration ne doivent jamais être installées en production.");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const ROLES = ["admin", "pharmacist1", "pharmacist2", "customer", "courier", "doctor1", "doctor2", "clinic"];
const email = (r) => `demo.${r}@pharmaproxi.invalid`;

async function findUser(mail) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email === mail);
    if (u) return u;
    if (data.users.length < 200) return null;
  }
  return null;
}

if (cmd === "install") {
  const password = process.env.DEMO_PASSWORD || randomBytes(9).toString("base64url");
  const ids = {};
  for (const r of ROLES) {
    const existing = await findUser(email(r));
    if (existing) {
      ids[r] = existing.id;
      await sb.auth.admin.updateUserById(existing.id, { password });
      continue;
    }
    const { data, error } = await sb.auth.admin.createUser({
      email: email(r), password, email_confirm: true, user_metadata: { full_name: `Démo ${r}` },
    });
    if (error) throw error;
    ids[r] = data.user.id;
  }
  const { data, error } = await sb.rpc("demo_install", { p_users: ids });
  if (error) {
    console.error("Échec :", error.message);
    process.exit(1);
  }
  console.log("Données de démonstration installées :", JSON.stringify(data));
  const dir = await sb.rpc("demo_directory_install", { p_users: ids });
  if (dir.error) {
    console.error("Échec (annuaire) :", dir.error.message);
    process.exit(1);
  }
  console.log("Annuaire de démonstration installé :", JSON.stringify(dir.data));
  console.log("\nComptes (domaine .invalid, aucun e-mail réel) :");
  for (const r of ROLES) console.log(`  ${r.padEnd(12)} ${email(r)}`);
  console.log(`\nMot de passe commun : ${password}`);
  console.log("⚠ La livraison a été activée pour la démonstration ; elle sera désactivée à la désinstallation.");
} else {
  const dir = await sb.rpc("demo_directory_uninstall");
  if (dir.error) {
    console.error("Échec (annuaire) :", dir.error.message);
    process.exit(1);
  }
  const { data, error } = await sb.rpc("demo_uninstall");
  if (error) {
    console.error("Échec :", error.message);
    process.exit(1);
  }
  for (const r of ROLES) {
    const u = await findUser(email(r));
    if (u) await sb.auth.admin.deleteUser(u.id);
  }
  console.log("Données de démonstration supprimées :", JSON.stringify(data));
}
