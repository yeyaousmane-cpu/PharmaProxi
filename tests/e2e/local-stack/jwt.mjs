// Génère des JWT HS256 (clés anon / service_role) pour la pile locale de test.
import { createHmac } from "node:crypto";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
export function sign(payload, secret) {
  const h = b64({ alg: "HS256", typ: "JWT" });
  const p = b64({ iss: "supabase-local", iat: 1700000000, exp: 2000000000, ...payload });
  const s = createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
}
if (process.argv[2]) console.log(sign({ role: process.argv[2] }, process.argv[3]));
