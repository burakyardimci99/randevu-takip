/**
 * SQLite → PostgreSQL VERİ taşıma (#2 doğrulama + gerçek migration aracı).
 *
 * Mevcut data/klab.db içeriğini DATABASE_URL'deki Postgres'e kopyalar.
 * Şema önce uygulanmış olmalı (initSchema / schema.pg.sql). Kolonlar/tipler
 * birebir aynı (TEXT/INTEGER) olduğundan satırlar doğrudan kopyalanır.
 * FK sırası derdi yok: session_replication_role=replica ile FK trigger'ları
 * geçici kapatılır (klab superuser).
 *
 * Kullanım: DATABASE_URL=postgres://... tsx scripts/migrate-sqlite-to-pg.ts
 */
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import pg from 'pg';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL gerekli.');

  const sqlite = new Database(resolve(process.cwd(), 'data/klab.db'), { readonly: true });
  const pool = new pg.Pool({ connectionString: url });
  const client = await pool.connect();

  // Kopyalanacak tablolar (sqlite_master'dan; schema_migrations dahil)
  const tables = (
    sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string }>
  ).map((r) => r.name);

  await client.query('SET session_replication_role = replica'); // FK trigger'larını kapat
  let totalRows = 0;
  try {
    // TÜM tabloları TEK SEFERDE temizle (CASCADE bir tabloyu ikinci kez silmesin).
    await client.query(
      `TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} CASCADE`
    );
    for (const table of tables) {
      const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all() as Array<Record<string, unknown>>;
      if (rows.length === 0) {
        console.log(`  ${table}: 0`);
        continue;
      }
      for (const row of rows) {
        const cols = Object.keys(row);
        const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
        const colList = cols.map((c) => `"${c}"`).join(', ');
        await client.query(
          `INSERT INTO "${table}" (${colList}) VALUES (${ph})`,
          cols.map((c) => row[c])
        );
      }
      totalRows += rows.length;
      console.log(`  ${table}: ${rows.length}`);
    }
  } finally {
    await client.query('SET session_replication_role = DEFAULT');
    client.release();
    await pool.end();
    sqlite.close();
  }
  console.log(`\nToplam ${totalRows} satır ${tables.length} tabloya kopyalandı.`);
}

main().catch((err) => {
  console.error('migrate hata:', err);
  process.exit(1);
});
