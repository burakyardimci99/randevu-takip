/**
 * Async DB katmanı smoke testi (#2 Faz B doğrulama).
 *
 * Çalışan Postgres'e (veya SQLite'a) karşı dbAll/dbOne/dbRun/dbExec/dbTx +
 * lehçe çevirilerini (?→$n, CURRENT_TIMESTAMP, INSERT OR IGNORE) doğrular.
 *
 * Kullanım:
 *   pg:     DATABASE_URL=postgres://klab:klab_dev_password@localhost:5432/klab tsx scripts/smoke-async-db.ts
 *   sqlite: tsx scripts/smoke-async-db.ts   (DATABASE_URL yok)
 */
// config yüklemesi için gerekli env (test ortamı gibi).
process.env.NODE_ENV ??= 'development';
process.env.CSRF_SECRET ??= 'smoke_csrf_secret_minimum_32_chars_value_aaaa';
process.env.FRONTEND_ORIGIN ??= 'http://localhost:5173';
process.env.USER_JWT_PRIVATE_KEY_PATH ??= './keys/user_private.pem';
process.env.USER_JWT_PUBLIC_KEY_PATH ??= './keys/user_public.pem';
process.env.ADMIN_JWT_PRIVATE_KEY_PATH ??= './keys/admin_private.pem';
process.env.ADMIN_JWT_PUBLIC_KEY_PATH ??= './keys/admin_public.pem';
process.env.DB_PATH ??= './data/klab-smoke.db';

async function main() {
  const { getDialect, dbAll, dbOne, dbRun, dbExec, dbTx, closeDb } = await import(
    '../src/db/async-db'
  );

  const d = getDialect();
  console.log(`[smoke] dialect = ${d}`);
  let ok = 0;
  const fail: string[] = [];
  const assert = (cond: boolean, label: string) => {
    if (cond) {
      ok++;
      console.log(`  ✓ ${label}`);
    } else {
      fail.push(label);
      console.log(`  ✗ ${label}`);
    }
  };

  // Temiz başla
  await dbExec('DROP TABLE IF EXISTS smoke_t');
  await dbExec(`CREATE TABLE smoke_t (
    id TEXT PRIMARY KEY,
    n INTEGER NOT NULL DEFAULT 0,
    label TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  // run + ? placeholder + CURRENT_TIMESTAMP default
  const r1 = await dbRun('INSERT INTO smoke_t (id, n, label) VALUES (?, ?, ?)', ['a', 1, 'first']);
  assert(r1.changes === 1, 'dbRun insert changes=1');

  // one + ? placeholder
  const row = await dbOne<{ id: string; n: number; label: string; created_at: string }>(
    'SELECT * FROM smoke_t WHERE id = ?',
    ['a']
  );
  assert(!!row && row.n === 1 && row.label === 'first', 'dbOne select doğru satır');
  assert(!!row && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(row.created_at), 'CURRENT_TIMESTAMP string formatı (YYYY-MM-DD HH:MM:SS)');

  // INSERT OR IGNORE → çakışmada sessiz geç (PK 'a' zaten var)
  const r2 = await dbRun('INSERT OR IGNORE INTO smoke_t (id, n, label) VALUES (?, ?, ?)', ['a', 99, 'dup']);
  assert(r2.changes === 0, 'INSERT OR IGNORE çakışmada changes=0');
  const stillFirst = await dbOne<{ n: number }>('SELECT n FROM smoke_t WHERE id = ?', ['a']);
  assert(!!stillFirst && stillFirst.n === 1, 'INSERT OR IGNORE mevcut satırı değiştirmedi');

  // all + birden çok satır
  await dbRun('INSERT INTO smoke_t (id, n, label) VALUES (?, ?, ?)', ['b', 2, 'second']);
  const allRows = await dbAll<{ id: string }>('SELECT id FROM smoke_t ORDER BY n ASC');
  assert(allRows.length === 2 && allRows[0].id === 'a' && allRows[1].id === 'b', 'dbAll iki satır sıralı');

  // transaction COMMIT
  await dbTx(async (tx) => {
    await tx.run('INSERT INTO smoke_t (id, n, label) VALUES (?, ?, ?)', ['c', 3, 'tx-commit']);
  });
  const cRow = await dbOne('SELECT id FROM smoke_t WHERE id = ?', ['c']);
  assert(!!cRow, 'dbTx COMMIT satırı kalıcı');

  // transaction ROLLBACK (hata fırlat → geri alınmalı)
  try {
    await dbTx(async (tx) => {
      await tx.run('INSERT INTO smoke_t (id, n, label) VALUES (?, ?, ?)', ['d', 4, 'tx-rollback']);
      throw new Error('kasıtlı hata');
    });
  } catch {
    /* beklenen */
  }
  const dRow = await dbOne('SELECT id FROM smoke_t WHERE id = ?', ['d']);
  assert(!dRow, 'dbTx ROLLBACK satırı geri alındı');

  // UPDATE ... CURRENT_TIMESTAMP (çeviri)
  const r3 = await dbRun('UPDATE smoke_t SET n = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?', [
    42,
    'b',
  ]);
  assert(r3.changes === 1, 'UPDATE + CURRENT_TIMESTAMP changes=1');

  // temizlik
  await dbExec('DROP TABLE IF EXISTS smoke_t');
  await closeDb();

  console.log(`\n[smoke] ${ok} geçti, ${fail.length} kaldı (${d})`);
  if (fail.length) {
    console.error('BAŞARISIZ:', fail.join(', '));
    process.exit(1);
  }
  console.log('[smoke] TÜM TESTLER GEÇTİ ✓');
}

main().catch((err) => {
  console.error('[smoke] hata:', err);
  process.exit(1);
});
