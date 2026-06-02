/**
 * Database bağlantısı + şema bootstrap (#7 — yalnız PostgreSQL).
 *
 * Async DB API (dbAll/dbOne/dbRun/dbExec/dbTx) async-db.ts'ten gelir. Bu dosya:
 *  - Async API'yi re-export eder (servisler '../db/schema'tan import eder).
 *  - initSchema(): konsolide schema.pg.sql (idempotent, CREATE TABLE IF NOT EXISTS).
 *
 * Güvenlik: app_security.md §3 (parameterized).
 */
import { readFileSync } from 'node:fs';
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
 * Şemayı kur — konsolide schema.pg.sql (idempotent). pg çoklu-statement tek
 * query'de çalışır.
 */
export async function initSchema(): Promise<{ applied: string[] }> {
  const sqlPath = resolve(__dirname, 'schema.pg.sql');
  const sql = readFileSync(sqlPath, 'utf8');
  await dbExec(sql);
  return { applied: ['pg-consolidated-schema'] };
}
