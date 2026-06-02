/**
 * Vitest global setup — tüm test run'ından ÖNCE bir kez çalışır.
 *
 * klab_test PostgreSQL şemasını sıfırlar (önceki run'ın tüm tabloları/verisi gider).
 * Test dosyaları beforeAll'da initSchema() çağırıp şemayı yeniden kurar; testler
 * sequential çalışır (vitest fileParallelism: false) ve nanoid kimlikleriyle izole.
 *
 * NOT: Docker `klab-postgres` ayakta + `klab_test` veritabanı mevcut olmalı.
 */
import { Client } from 'pg';

export default async function globalSetup(): Promise<void> {
  const connectionString =
    process.env.TEST_DATABASE_URL ?? 'postgres://klab:klab_dev_password@localhost:5432/klab_test';
  const client = new Client({ connectionString });
  await client.connect();
  await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await client.end();
}
