/**
 * Asenkron DB katmanı (#2) — çift sürücü: SQLite (better-sqlite3) | PostgreSQL (pg).
 *
 * Sürücü seçimi: `DATABASE_URL` set ise → pg, değilse → sqlite (DB_PATH).
 * Böylece yerel geliştirme/test SQLite ile (Docker gerektirmez), Docker/prod pg ile.
 *
 * Tüm API ASENKRONDUR (pg async; sqlite senkron ama Promise sarmalı). Servisler
 * `dbAll/dbOne/dbRun/dbExec/dbTx` kullanır; somut sürücüden bağımsızdır.
 *
 * SQL taşınabilirliği (pg adaptöründe otomatik çeviri — SQL'i `?` + SQLite lehçesiyle
 * yazmaya devam edebiliriz):
 *  - `?`               → `$1, $2, …` (pozisyonel)
 *  - `CURRENT_TIMESTAMP`→ `to_char(now(),'YYYY-MM-DD HH24:MI:SS')` (SQLite string formatı korunur)
 *  - `INSERT OR IGNORE`→ `INSERT … ON CONFLICT DO NOTHING`
 * Tarih/zaman kolonları pg'de de TEXT (string karşılaştırma davranışı korunur).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from '../config/env';
import { logger } from '../utils/logger';

export type Dialect = 'sqlite' | 'pg';

export interface RunResult {
  changes: number;
  lastInsertRowid?: number | bigint;
}

/** Transaction içinde çağrılan sorgu yüzeyi (tek bağlantı/işlem üstünde). */
export interface DbExecutor {
  all<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<RunResult>;
  exec(sql: string): Promise<void>;
}

const dialect: Dialect = process.env.DATABASE_URL ? 'pg' : 'sqlite';

export function getDialect(): Dialect {
  return dialect;
}

export function isPg(): boolean {
  return dialect === 'pg';
}

/* ============================================================
 * pg lehçe çevirisi
 * ============================================================ */

function translateForPg(sql: string): string {
  let s = sql;
  // SQLite string-zaman formatını koru.
  s = s.replace(/CURRENT_TIMESTAMP/g, "to_char(now(), 'YYYY-MM-DD HH24:MI:SS')");
  // INSERT OR IGNORE → ON CONFLICT DO NOTHING
  let ignore = false;
  s = s.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, () => {
    ignore = true;
    return 'INSERT INTO';
  });
  if (ignore) {
    s = s.replace(/\s*;?\s*$/, '') + ' ON CONFLICT DO NOTHING';
  }
  // ? → $n (pozisyonel). Not: SQL string literal'lerinde ? kullanılmıyor.
  let i = 0;
  s = s.replace(/\?/g, () => `$${(i += 1)}`);
  return s;
}

/* ============================================================
 * SQLite sürücüsü (better-sqlite3 — senkron, Promise sarmalı)
 * ============================================================ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqliteDb: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sqliteHandle(): any {
  if (sqliteDb) return sqliteDb;
  // Lazy require — pg ortamında better-sqlite3 hiç yüklenmez.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3');
  const absolutePath = resolve(process.cwd(), config.dbPath);
  const dir = dirname(absolutePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  sqliteDb = new Database(absolutePath);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');
  sqliteDb.pragma('synchronous = NORMAL');
  return sqliteDb;
}

/** SQLite migration'ları için ham handle (yalnız sqlite lehçesinde). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getRawSqlite(): any {
  if (dialect !== 'sqlite') {
    throw new Error('getRawSqlite yalnız SQLite lehçesinde kullanılabilir.');
  }
  return sqliteHandle();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sqliteExecutor(handle: any): DbExecutor {
  return {
    async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      return handle.prepare(sql).all(...params) as T[];
    },
    async one<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
      return handle.prepare(sql).get(...params) as T | undefined;
    },
    async run(sql: string, params: unknown[] = []): Promise<RunResult> {
      const info = handle.prepare(sql).run(...params);
      return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
    },
    async exec(sql: string): Promise<void> {
      handle.exec(sql);
    },
  };
}

/* ============================================================
 * PostgreSQL sürücüsü (pg Pool — asenkron)
 * ============================================================ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pgPool: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pgPoolHandle(): any {
  if (pgPool) return pgPool;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pg = require('pg');
  // COUNT(*) vb. bigint (OID 20) varsayılan string döner → SQLite gibi number yap.
  // (id/sayım değerleri küçük; precision kaybı yok. int4 zaten number döner.)
  pg.types.setTypeParser(20, (v: string) => parseInt(v, 10));
  const { Pool } = pg;
  pgPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  pgPool.on('error', (err: Error) => logger.error('pg_pool_error', { err: err.message }));
  return pgPool;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pgExecutor(runner: { query: (text: string, params?: unknown[]) => Promise<any> }): DbExecutor {
  return {
    async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const res = await runner.query(translateForPg(sql), params);
      return res.rows as T[];
    },
    async one<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
      const res = await runner.query(translateForPg(sql), params);
      return (res.rows[0] as T) ?? undefined;
    },
    async run(sql: string, params: unknown[] = []): Promise<RunResult> {
      const res = await runner.query(translateForPg(sql), params);
      return { changes: res.rowCount ?? 0 };
    },
    async exec(sql: string): Promise<void> {
      // Çoklu-statement DDL: pg tek query'de ';' ile ayrılmış çalıştırabilir.
      await runner.query(sql);
    },
  };
}

/* ============================================================
 * Aktif executor + public API
 * ============================================================ */

function activeExecutor(): DbExecutor {
  return dialect === 'pg' ? pgExecutor(pgPoolHandle()) : sqliteExecutor(sqliteHandle());
}

/**
 * Aktif transaction context'i. dbTx içindeyken global dbAll/dbOne/dbRun/dbExec
 * OTOMATİK transaction bağlantısına yönlenir (pg: tx client, sqlite: aynı handle).
 * Böylece transaction gövdesinde ekstra `tx.` kullanımı GEREKMEZ — sadece sarmalama.
 */
const txContext = new AsyncLocalStorage<DbExecutor>();

function currentExecutor(): DbExecutor {
  return txContext.getStore() ?? activeExecutor();
}

export function dbAll<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  return currentExecutor().all<T>(sql, params);
}

export function dbOne<T = unknown>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return currentExecutor().one<T>(sql, params);
}

export function dbRun(sql: string, params: unknown[] = []): Promise<RunResult> {
  return currentExecutor().run(sql, params);
}

export function dbExec(sql: string): Promise<void> {
  return currentExecutor().exec(sql);
}

/**
 * Atomik transaction. Callback'e işlem-bağlı executor verilir.
 *  - pg: havuzdan tek client, BEGIN/COMMIT/ROLLBACK.
 *  - sqlite: tek bağlantı üstünde BEGIN/COMMIT/ROLLBACK (Node tek-thread + senkron
 *    sqlite → atomik; callback DB-dışı uzun await yapmamalı).
 */
export async function dbTx<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
  if (dialect === 'pg') {
    const client = await pgPoolHandle().connect();
    const tx = pgExecutor(client);
    try {
      await client.query('BEGIN');
      // ALS: gövdedeki global dbX çağrıları bu client'a (transaction'a) yönlenir.
      const result = await txContext.run(tx, () => fn(tx));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw err;
    } finally {
      client.release();
    }
  }

  const handle = sqliteHandle();
  const tx = sqliteExecutor(handle);
  handle.exec('BEGIN');
  try {
    const result = await txContext.run(tx, () => fn(tx));
    handle.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      handle.exec('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export async function closeDb(): Promise<void> {
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = null;
  }
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
}
