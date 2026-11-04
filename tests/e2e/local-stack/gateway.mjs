// Passerelle minimale imitant l'API Supabase (pile locale de test uniquement) :
// /auth/v1 -> GoTrue, /rest/v1 -> PostgREST, /storage/v1/object -> stockage émulé sur disque.
// Le stockage émulé applique les mêmes politiques RLS que Supabase sur storage.objects
// (chaque opération est exécutée avec le rôle « authenticated » et l'identité du jeton).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const routes = [
  ["/auth/v1", Number(process.env.AUTH_PORT ?? 9999)],
  ["/rest/v1", Number(process.env.REST_PORT ?? 3001)],
];
const PGURL = process.env.PGURL ?? "postgres://postgres@localhost:54322";
const DB = process.env.DB ?? "pp_e2e";
const ROOT = process.env.STORAGE_DIR ?? "/tmp/pp-e2e-storage";
const pool = new pg.Pool({ connectionString: `${PGURL}/${DB}`, max: 4 });

const claimsOf = (req) => {
  const t = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  try { return JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString()); } catch { return {}; }
};
async function asUser(req, fn) {
  const c = await pool.connect();
  const claims = claimsOf(req);
  try {
    await c.query("begin");
    await c.query(`set local role ${claims.role === "service_role" ? "service_role" : claims.sub ? "authenticated" : "anon"}`);
    await c.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true), set_config('request.jwt.claim.role', $3, true)",
      [JSON.stringify(claims), claims.sub ?? "", claims.role ?? "anon"]);
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) { await c.query("rollback").catch(() => {}); throw e; } finally { c.release(); }
}
const body = (req) => new Promise((ok) => { const b = []; req.on("data", (d) => b.push(d)); req.on("end", () => ok(Buffer.concat(b))); });
const send = (res, code, obj, type = "application/json") => { res.writeHead(code, { "content-type": type }); res.end(type === "application/json" ? JSON.stringify(obj) : obj); };

async function storage(req, res) {
  const u = new URL(req.url, "http://x");
  const parts = decodeURIComponent(u.pathname).replace(/^\/storage\/v1\/object\/?/, "").replace(/^authenticated\//, "").split("/");
  const bucket = parts.shift(); const name = parts.join("/");
  try {
    if (req.method === "POST" || req.method === "PUT") {
      const data = await body(req);
      await asUser(req, (c) => c.query("insert into storage.objects (bucket_id, name, owner) values ($1, $2, nullif(current_setting('request.jwt.claim.sub', true), '')::uuid)", [bucket, name]));
      fs.mkdirSync(path.dirname(path.join(ROOT, bucket, name)), { recursive: true });
      fs.writeFileSync(path.join(ROOT, bucket, name), data);
      return send(res, 200, { Key: `${bucket}/${name}` });
    }
    if (req.method === "GET") {
      const r = await asUser(req, (c) => c.query("select 1 from storage.objects where bucket_id = $1 and name = $2", [bucket, name]));
      const f = path.join(ROOT, bucket, name);
      if (!r.rowCount || !fs.existsSync(f)) return send(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
      res.writeHead(200, { "content-type": "application/octet-stream" }); return res.end(fs.readFileSync(f));
    }
    if (req.method === "DELETE") {
      const { prefixes = [] } = JSON.parse((await body(req)).toString() || "{}");
      const r = await asUser(req, (c) => c.query("delete from storage.objects where bucket_id = $1 and name = any($2) returning name", [bucket, prefixes]));
      for (const row of r.rows) fs.rmSync(path.join(ROOT, bucket, row.name), { force: true });
      return send(res, 200, r.rows.map((x) => ({ name: x.name })));
    }
    return send(res, 405, { message: "Méthode non émulée" });
  } catch (e) {
    return send(res, 400, { statusCode: "403", error: "Unauthorized", message: String(e.message ?? e) });
  }
}

http.createServer((req, res) => {
  if (req.url.startsWith("/storage/v1/object")) return void storage(req, res);
  const r = routes.find(([p]) => req.url.startsWith(p + "/") || req.url === p);
  if (!r) {
    res.writeHead(501, { "content-type": "application/json" });
    return res.end(JSON.stringify({ message: "Service non émulé localement" }));
  }
  const p = req.url.slice(r[0].length) || "/";
  const up = http.request({ host: "127.0.0.1", port: r[1], path: p, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${r[1]}` } }, (u) => {
    res.writeHead(u.statusCode ?? 502, u.headers);
    u.pipe(res);
  });
  up.on("error", (e) => { res.writeHead(502); res.end(String(e)); });
  req.pipe(up);
}).listen(Number(process.env.GATEWAY_PORT ?? 54321), () => console.log("passerelle prête"));
