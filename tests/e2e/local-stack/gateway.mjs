// Passerelle minimale imitant l'API Supabase : /auth/v1 -> GoTrue, /rest/v1 -> PostgREST.
// Le stockage (/storage/v1) n'est pas émulé localement.
import http from "node:http";
const routes = [
  ["/auth/v1", Number(process.env.AUTH_PORT ?? 9999)],
  ["/rest/v1", Number(process.env.REST_PORT ?? 3001)],
];
http.createServer((req, res) => {
  const r = routes.find(([p]) => req.url.startsWith(p + "/") || req.url === p);
  if (!r) {
    res.writeHead(501, { "content-type": "application/json" });
    return res.end(JSON.stringify({ message: "Service non émulé localement (stockage)" }));
  }
  const path = req.url.slice(r[0].length) || "/";
  const up = http.request({ host: "127.0.0.1", port: r[1], path, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${r[1]}` } }, (u) => {
    res.writeHead(u.statusCode ?? 502, u.headers);
    u.pipe(res);
  });
  up.on("error", (e) => { res.writeHead(502); res.end(String(e)); });
  req.pipe(up);
}).listen(Number(process.env.GATEWAY_PORT ?? 54321), () => console.log("passerelle prête"));
