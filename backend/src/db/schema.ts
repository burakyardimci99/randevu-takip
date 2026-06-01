/**
 * Database bağlantısı + şema bootstrap (#2 — çift sürücü).
 *
 * Async DB API (dbAll/dbOne/dbRun/dbExec/dbTx) async-db.ts'ten gelir; sürücü
 * DATABASE_URL'e göre seçilir (pg | sqlite). Bu dosya:
 *  - Async API'yi re-export eder (geriye uyum: servisler '../db/schema'tan import eder).
 *  - initSchema(): pg → konsolide schema.pg.sql, sqlite → versiyonlu migration'lar.
 *  - getDb(): GEÇİŞ DÖNEMİ shim'i — sqlite ham handle (henüz async'e çevrilmemiş
 *    dosyalar için). pg'de hata verir; tüm çağrılar dbX'e taşınınca kaldırılacak.
 *
 * Güvenlik: app_security.md §3 (parameterized), data_security.md §11 (versiyonlu migration).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runMigrations } from './migrations';
import {
  dbAll,
  dbOne,
  dbRun,
  dbExec,
  dbTx,
  closeDb,
  getDialect,
  isPg,
  getRawSqlite,
} from './async-db';

export { dbAll, dbOne, dbRun, dbExec, dbTx, closeDb, getDialect, isPg };
export type { RunResult, DbExecutor, Dialect } from './async-db';

/**
 * GEÇİŞ shim'i: senkron better-sqlite3 ham handle. Yalnız henüz async'e
 * çevrilmemiş kod için (sqlite). pg lehçesinde çağrılırsa hata verir.
 * @deprecated Async dbAll/dbOne/dbRun/dbExec/dbTx kullanın.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getDb(): any {
  return getRawSqlite();
}

/**
 * Şemayı kur. pg → konsolide schema.pg.sql (idempotent), sqlite → migrations.ts.
 */
export async function initSchema(): Promise<{ applied: string[] }> {
  if (getDialect() === 'pg') {
    const sqlPath = resolve(__dirname, 'schema.pg.sql');
    const sql = readFileSync(sqlPath, 'utf8');
    await dbExec(sql); // pg çoklu-statement: tek query'de çalışır
    return { applied: ['pg-consolidated-schema'] };
  }
  // sqlite — versiyonlu migration'lar (senkron, ham handle)
  return runMigrations(getRawSqlite());
}
