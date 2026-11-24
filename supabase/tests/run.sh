#!/usr/bin/env bash
# Applies all migrations to a throwaway local Postgres (with a minimal Supabase stub)
# and runs the RLS / privacy / RPC behaviour checks. Usage:
#   PGHOST=/path/to/socket PGPORT=5432 PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=senim_test
dropdb --if-exists "$DB" && createdb "$DB"
psql -d "$DB" -q -v ON_ERROR_STOP=1 -f supabase/tests/supabase_stub.sql 2>/dev/null
for f in supabase/migrations/*.sql; do
  # pg_net is provided by the stub (net.http_post records calls instead of sending them).
  sed 's/^create extension if not exists pg_net.*$//' "$f" | psql -d "$DB" -q -v ON_ERROR_STOP=1
done
psql -d "$DB" -q -f supabase/tests/behavior.sql 2>&1 | grep -E "OK |ERROR|FAIL|should have|leaked|allowed|exposed|open" || true
