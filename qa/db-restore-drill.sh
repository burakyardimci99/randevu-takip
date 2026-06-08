#!/usr/bin/env bash
# Yedek/geri yükleme tatbikatı — TAHRİBATSIZ sürüm.
# klab DB'sini dump eder, geçici klab_restore_verify DB'sine restore eder,
# satır sayılarını karşılaştırır, sonra geçici DB'yi siler.
# Çalıştırma: bash qa/db-restore-drill.sh
set -euo pipefail
PGUSER=klab
SRC=klab
TMP=klab_restore_verify
DUMP=/tmp/klab_drill.dump
dc() { docker compose exec -T postgres "$@"; }

echo "=== Backup/Restore tatbikatı (tahribatsız) ==="

echo "1) Kaynak satır sayıları (klab):"
SRC_COUNTS=$(dc psql -U "$PGUSER" -d "$SRC" -tA -c \
  "SELECT 'users='||count(*) FROM users UNION ALL SELECT 'bookings='||count(*) FROM bookings UNION ALL SELECT 'rooms='||count(*) FROM rooms ORDER BY 1;")
echo "$SRC_COUNTS" | sed 's/^/   /'

echo "2) Yedek alınıyor (pg_dump -Fc)..."
START=$(date +%s)
dc pg_dump -U "$PGUSER" -d "$SRC" -Fc -f "$DUMP"
echo "   yedek: $DUMP"

echo "3) Geçici DB hazırlanıyor: $TMP"
dc psql -U "$PGUSER" -d "$SRC" -c "DROP DATABASE IF EXISTS $TMP;" >/dev/null
dc psql -U "$PGUSER" -d "$SRC" -c "CREATE DATABASE $TMP;" >/dev/null

echo "4) Geri yükleniyor..."
dc pg_restore -U "$PGUSER" -d "$TMP" "$DUMP" 2>/dev/null || true
END=$(date +%s)

echo "5) Hedef satır sayıları ($TMP):"
DST_COUNTS=$(dc psql -U "$PGUSER" -d "$TMP" -tA -c \
  "SELECT 'users='||count(*) FROM users UNION ALL SELECT 'bookings='||count(*) FROM bookings UNION ALL SELECT 'rooms='||count(*) FROM rooms ORDER BY 1;")
echo "$DST_COUNTS" | sed 's/^/   /'

echo "6) Temizlik: $TMP siliniyor"
dc psql -U "$PGUSER" -d "$SRC" -c "DROP DATABASE IF EXISTS $TMP;" >/dev/null

if [ "$SRC_COUNTS" = "$DST_COUNTS" ]; then
  echo "=== ✅ Restore doğrulandı — satır sayıları eşit (RTO ~$((END-START)) sn) ==="
else
  echo "=== ❌ Satır sayıları eşleşmedi! ==="; exit 1
fi
