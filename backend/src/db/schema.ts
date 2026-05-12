/**
 * Database connection + schema bootstrapping.
 *
 * Güvenlik:
 * - app_security.md §3: Tüm sorgular parameterized. String concat YASAK.
 * - app_security.md §10: Race condition için UNIQUE constraint + transaction.
 * - data_security.md §11: Versiyonlanmış migration sistemi (migrations.ts).
 */
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from '../config/env';
import { runMigrations } from './migrations';

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  const absolutePath = resolve(process.cwd(), config.dbPath);
  const dir = dirname(absolutePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  dbInstance = new Database(absolutePath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');
  dbInstance.pragma('synchronous = NORMAL');
  return dbInstance;
}

export function initSchema(): { applied: string[] } {
  const db = getDb();
  return runMigrations(db);
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
