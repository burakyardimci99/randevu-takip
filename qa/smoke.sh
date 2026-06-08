#!/usr/bin/env bash
# Deploy sonrası hızlı sağlık kontrolü (smoke).
# Çalıştırma: bash qa/smoke.sh [BACKEND_URL] [FRONTEND_URL]
set -euo pipefail
BASE=${1:-http://localhost:4000}
FE=${2:-http://localhost:5173}
fail=0
chk() { # ad  beklenen  gerçek
  if [ "$2" = "$3" ]; then echo "  ✅ $1 ($3)"; else echo "  ❌ $1 (beklenen $2, gelen $3)"; fail=1; fi
}
echo "=== Smoke — $BASE / $FE ==="
chk "Backend health"   200 "$(curl -fsS -o /dev/null -w '%{http_code}' "$BASE/api/health" || echo 000)"
chk "OpenAPI"          200 "$(curl -fsS -o /dev/null -w '%{http_code}' "$BASE/api/openapi.json" || echo 000)"
chk "CSRF token"       200 "$(curl -fsS -o /dev/null -w '%{http_code}' "$BASE/api/csrf" || echo 000)"
chk "Public showcase"  200 "$(curl -fsS -o /dev/null -w '%{http_code}' "$BASE/api/public/showcase" || echo 000)"
chk "Frontend"         200 "$(curl -fsS -o /dev/null -w '%{http_code}' "$FE/" || echo 000)"
echo -n "  health gövdesi: "; curl -fsS "$BASE/api/health" || true; echo
[ "$fail" = 0 ] && echo "=== ✅ Smoke geçti ===" || { echo "=== ❌ Smoke başarısız ==="; exit 1; }
