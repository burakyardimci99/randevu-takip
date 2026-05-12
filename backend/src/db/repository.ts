/**
 * Database repository abstraction.
 *
 * Amaç: Service'ları somut `better-sqlite3` API'sinden soyutlamak.
 *  - Migration cost'unu azaltır: PostgreSQL geçişinde sadece adapter değişir,
 *    service'lar dokunulmaz.
 *  - Test edilebilirlik: in-memory adapter ile mock kolaylığı.
 *
 * Şu an: SqliteRepository (better-sqlite3 sarmalayıcı).
 * Production: PgRepository (pg / postgres.js) eklenebilir — aynı arayüz.
 *
 * NOT: getDb() shim'i geriye uyum için duruyor; yeni kodlarda repository() tercih edilir.
 */
import type Database from 'better-sqlite3';
import { getDb } from './schema';

export interface QueryResult {
  changes: number;
  lastInsertRowid?: number | bigint;
}

export interface Transaction {
  /** Çağrı içinde otomatik commit/rollback (better-sqlite3 stili). */
  run<T>(fn: () => T): T;
}

export interface Repository {
  /** Tek satır döner (yoksa undefined). */
  one<T = unknown>(sql: string, params?: unknown[]): T | undefined;
  /** Çoklu satır. */
  all<T = unknown>(sql: string, params?: unknown[]): T[];
  /** Yaz işlemi (INSERT/UPDATE/DELETE). */
  exec(sql: string, params?: unknown[]): QueryResult;
  /** Toplu DDL/DML script. */
  raw(sql: string): void;
  /** Transaction. */
  transaction(): Transaction;
}

class SqliteRepository implements Repository {
  private get db(): Database.Database {
    return getDb();
  }

  one<T = unknown>(sql: string, params: unknown[] = []): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  all<T = unknown>(sql: string, params: unknown[] = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  exec(sql: string, params: unknown[] = []): QueryResult {
    const stmt = this.db.prepare(sql);
    const info = stmt.run(...params);
    return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
  }

  raw(sql: string): void {
    this.db.exec(sql);
  }

  transaction(): Transaction {
    const db = this.db;
    return {
      run<T>(fn: () => T): T {
        const wrapped = db.transaction(fn);
        return wrapped();
      },
    };
  }
}

let repoInstance: Repository | null = null;

export function repository(): Repository {
  if (!repoInstance) repoInstance = new SqliteRepository();
  return repoInstance;
}

/**
 * Test/migration için repository'i override etmek.
 * Production kodunda kullanılmaz.
 */
export function _setRepositoryForTests(repo: Repository): void {
  repoInstance = repo;
}
