/**
 * Database bağlantısı + şema bootstrap (#7 — yalnız PostgreSQL).
 *
 * Async DB API (dbAll/dbOne/dbRun/dbExec/dbTx) async-db.ts'ten gelir. Bu dosya:
 *  - Async API'yi re-export eder (servisler '../db/schema'tan import eder).
 *  - initSchema(): konsolide schema.pg.sql (idempotent, CREATE TABLE IF NOT EXISTS).
 *
 * Güvenlik: app_security.md §3 (parameterized).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  dbAll,
  dbOne,
  dbRun,
  dbExec,
  dbTx,
  closeDb,
  getDialect,
  isPg,
} from './async-db';

export { dbAll, dbOne, dbRun, dbExec, dbTx, closeDb, getDialect, isPg };
export type { RunResult, DbExecutor, Dialect } from './async-db';

/**
 * Şemayı kur — iki katman:
 *  1) Baseline: konsolide schema.pg.sql (idempotent, her boot'ta koşar).
 *  2) Versiyonlu migration'lar: src/db/migrations/NNNN-*.sql dosyaları,
 *     schema_migrations tablosuna işlenmemiş olanlar sırayla uygulanır
 *     (her biri kendi transaction'ında; başarısız olursa boot durur).
 */
export async function initSchema(): Promise<{ applied: string[] }> {
  const sqlPath = resolve(__dirname, 'schema.pg.sql');
  const sql = readFileSync(sqlPath, 'utf8');
  await dbExec(sql);

  const applied: string[] = ['pg-consolidated-schema'];

  // --- Versiyonlu migration'lar ---
  const migrationsDir = resolve(__dirname, 'migrations');
  let files: string[] = [];
  try {
    files = readdirSync(migrationsDir)
      .filter((f) => /^\d{4}-.+\.sql$/.test(f))
      .sort();
  } catch {
    // migrations/ dizini yoksa (eski build) — baseline yeterli.
    return { applied };
  }

  if (files.length === 0) return { applied };

  // Tüm bekleyen migration'lar TEK transaction + advisory kilit altında uygulanır.
  // pg_advisory_xact_lock (blocking): birden fazla backend instance aynı anda boot
  // olursa yalnız biri migrate eder; diğeri bekler, tx commit'ten sonra güncel
  // schema_migrations'ı okuyup zaten uygulananları atlar (çift uygulama yarışı yok).
  // Kilit tx sonunda otomatik serbest kalır. NOT: migration'lar tx-güvenli olmalı
  // (CREATE INDEX CONCURRENTLY gibi tx-dışı komut KULLANMAYIN — bkz. migrations/README.md).
  await dbTx(async () => {
    await dbRun('SELECT pg_advisory_xact_lock(hashtext(?))', ['klab:schema_migrations']);

    const doneRows = (await dbAll(`SELECT id FROM schema_migrations`, [])) as Array<{ id: string }>;
    const done = new Set(doneRows.map((r) => r.id));

    for (const file of files) {
      if (done.has(file)) continue;
      const migrationSql = readFileSync(resolve(migrationsDir, file), 'utf8');
      await dbExec(migrationSql);
      await dbRun(`INSERT INTO schema_migrations (id, name) VALUES (?, ?)`, [file, file]);
      applied.push(file);
    }
  });

  return { applied };
}
