#!/bin/bash
# Local Postgres test of auth-stage-a.sql and auth-stage-b.sql. Needs a throwaway Postgres 16 on /tmp:5544 (see docs/auth-lockdown.md).
set -e
SQL="$(cd "$(dirname "$0")/../../supabase" && pwd)"; HERE="$(cd "$(dirname "$0")" && pwd)"
P="psql -h /tmp -p 5544 -U postgres -v ON_ERROR_STOP=1 -q"
dropdb -h /tmp -p 5544 -U postgres --if-exists ssauth; createdb -h /tmp -p 5544 -U postgres ssauth; P="$P -d ssauth"
$P -f "$HERE/standin.sql"; $P -f "$SQL/save-safety.sql" 2>&1 | grep -iv notice || true; $P -f "$SQL/activity-log.sql" 2>&1 | grep -iv notice || true
export P HERE SQL
python3 "$HERE/matrix.py"
