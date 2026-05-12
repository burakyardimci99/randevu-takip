/**
 * PostgreSQL adapter (opt-in via DATABASE_URL env var).
 *
 * Strateji:
 *  - Default: SQLite (mevcut demo akışı).
 *  - DATABASE_URL set ise: `pg` paketi ile PostgreSQL bağlantısı.
 *  - Repository pattern üzerinden çalışır (servisler dokunulmaz).
 *
 * NOT: Bu dosya `pg` paketini DİNAMİK import eder — paketten yüklenmediği sürece
 *      bundle size'a etki etmez. Production'da `npm i pg` gerekir.
 *
 * Migration:
 *  - migrations.ts SQLite-spesifik SQL içeriyor.
 *  - PG geçişinde her migration'ın PG karşılığı yazılmalı (ALTER TABLE ADD COLUMN
 *    Postgres'te de aynı ama JSON1, partial index, datetime fonksiyonları farklı).
 *  - Bu adapter şu an SADECE OKUMA için altyapı sağlar (sorgu ve transaction
 *    arayüzleri) — gerçek üretime alma adımları README'de.
 *
 * Şu an: skeleton + isPgConfigured() helper.
 */
import type { Repository } from './repository';

export function isPgConfigured(): boolean {
  return !!process.env.DATABASE_URL && process.env.DATABASE_URL.length > 10;
}

export async function createPgRepository(): Promise<Repository> {
  if (!isPgConfigured()) {
    throw new Error('DATABASE_URL set değil — PostgreSQL adapter yüklenemez.');
  }

  // Dinamik import — pg paketi yoksa fail-fast değil, runtime hatası verir.
  // (`pg` paketi opsiyoneldir; production'da `npm i pg` ile yüklenir)
  let pgModule: { Pool: new (cfg: Record<string, unknown>) => { query: (s: string) => Promise<unknown> } } | null = null;
  try {
    // String-based dynamic import bypasses TS module resolution at build time.
    pgModule = (await import(/* @vite-ignore */ 'pg' as string)) as typeof pgModule;
  } catch {
    throw new Error(
      '`pg` paketi yüklü değil. Production için: `npm i pg @types/pg`'
    );
  }

  const { Pool } = pgModule!;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
  });

  // Bağlantı sağlığı testi
  await pool.query('SELECT 1');

  return {
    one<T>(sql: string, params: unknown[] = []): T | undefined {
      // PostgreSQL async, repository sync — bu sürümde callback üzerinden simüle ediyoruz.
      // Production'da: tüm servisleri async'e migrate etmek gerekir.
      throw new Error(
        'PG adapter şu an SQLite ile aynı sync API sunmuyor; servisleri async-ifi ye geçirin.'
      );
      void sql;
      void params;
    },
    all<T>(sql: string, params: unknown[] = []): T[] {
      throw new Error('PG adapter sync API desteklemiyor.');
      void sql;
      void params;
    },
    exec(sql: string, params: unknown[] = []) {
      throw new Error('PG adapter sync API desteklemiyor.');
      void sql;
      void params;
    },
    raw(sql: string) {
      throw new Error('PG adapter sync API desteklemiyor.');
      void sql;
    },
    transaction() {
      throw new Error('PG adapter sync API desteklemiyor.');
    },
  };
}

/**
 * PG schema migration için kullanılabilecek SQL parçaları (referans).
 * Production'a geçişte `migrations.ts`'in PG versiyonunu üretmek için kullanılır.
 */
export const pgSchemaHints = {
  jsonColumn: 'JSONB', // SQLite'ta TEXT idi
  timestamp: 'TIMESTAMPTZ DEFAULT NOW()',
  uuidGen: 'gen_random_uuid()', // pgcrypto extension gerekir
  partialIndex: true, // PG destekler
  upsertConflict: 'ON CONFLICT (col) DO UPDATE SET ...',
};
