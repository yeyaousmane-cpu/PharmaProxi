#!/usr/bin/env bash
# Pile Supabase minimale sans Docker, utilisée pour les tests de bout en bout :
# PostgreSQL local + GoTrue (Supabase Auth) + PostgREST + passerelle.
# Usage : BIN=/chemin/vers/binaires PGURL=postgres://postgres@localhost:54322 ./start.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
BIN="${BIN:?répertoire contenant auth et postgrest}"
PGURL="${PGURL:-postgres://postgres@localhost:54322}"
DB="${DB:-pp_e2e}"
SECRET="${JWT_SECRET:-local-e2e-secret-at-least-32-characters-long!!}"
LOG="${LOG:-/tmp/pp-e2e}"
mkdir -p "$LOG"

psql "$PGURL/postgres" -qc "drop database if exists $DB with (force)" -c "create database $DB"
psql "$PGURL/$DB" -qc "create schema if not exists auth"

# 1. GoTrue : migrations du schéma auth, puis démarrage en arrière-plan
export GOTRUE_DB_DRIVER=postgres DATABASE_URL="$PGURL/$DB?sslmode=disable&search_path=auth" GOTRUE_DB_NAMESPACE=auth \
  GOTRUE_JWT_SECRET="$SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated \
  GOTRUE_SITE_URL=http://localhost:3000 API_EXTERNAL_URL=http://localhost:54321/auth/v1 GOTRUE_API_HOST=127.0.0.1 PORT=9999 \
  GOTRUE_MAILER_AUTOCONFIRM=true GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_DISABLE_SIGNUP=false GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 \
  GOTRUE_LOG_LEVEL=warn
(cd "$BIN" && ./auth migrate > "$LOG/auth-migrate.log" 2>&1)
(cd "$BIN" && setsid nohup ./auth serve > "$LOG/auth.log" 2>&1 < /dev/null &)
for i in $(seq 1 60); do curl -sf http://127.0.0.1:9999/health >/dev/null && break; sleep 1; done
curl -sf http://127.0.0.1:9999/health >/dev/null || { echo "GoTrue n'a pas démarré"; cat "$LOG/auth.log"; exit 1; }

# 2. Rôles + stockage minimal + migrations PharmaProxi
psql "$PGURL/$DB" -q -v ON_ERROR_STOP=1 -f "$HERE/roles-storage.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do psql "$PGURL/$DB" -q -v ON_ERROR_STOP=1 -f "$f"; done

# 3. PostgREST
cat > "$LOG/postgrest.conf" <<CONF
db-uri = "postgres://authenticator:authenticator@localhost:54322/$DB"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-port = 3001
server-host = "127.0.0.1"
CONF
(setsid nohup "$BIN/postgrest" "$LOG/postgrest.conf" > "$LOG/postgrest.log" 2>&1 < /dev/null &)

# 4. Passerelle
(setsid nohup node "$HERE/gateway.mjs" > "$LOG/gateway.log" 2>&1 < /dev/null &)
sleep 2
echo "ANON_KEY=$(node "$HERE/jwt.mjs" anon "$SECRET")"
echo "SERVICE_KEY=$(node "$HERE/jwt.mjs" service_role "$SECRET")"
