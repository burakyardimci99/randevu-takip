/**
 * SQLite şemasının SON halini (tüm migration'ların sonucu) Postgres DDL'ine çevirir
 * ve src/db/schema.pg.sql olarak yazar (#2 Faz C — konsolide pg şema).
 *
 * Çeviri kuralları:
 *  - DATETIME/DATE → TEXT (string karşılaştırma + CURRENT_TIMESTAMP davranışı korunur)
 *  - DEFAULT CURRENT_TIMESTAMP → DEFAULT to_char(now(),'YYYY-MM-DD HH24:MI:SS')
 *  - inline FOREIGN KEY'ler çıkarılır → sona ALTER TABLE ADD CONSTRAINT (sıra/cycle sorunu yok)
 *  - CREATE TABLE → CREATE TABLE IF NOT EXISTS, index'ler IF NOT EXISTS (idempotent)
 *  - CHECK/UNIQUE/PRIMARY KEY korunur (pg uyumlu)
 *
 * Kullanım: tsx scripts/gen-pg-schema.ts   (data/klab.db'den okur)
 */
import Database from 'better-sqlite3';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dbPath = resolve(process.cwd(), 'data/klab.db');
const db = new Database(dbPath, { readonly: true });

interface Obj {
  type: string;
  name: string;
  sql: string;
}

const objs = db
  .prepare(
    "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'"
  )
  .all() as Obj[];

const tables = objs.filter((o) => o.type === 'table');
const indexes = objs.filter((o) => o.type === 'index');

interface Fk {
  table: string;
  clause: string;
}
const fks: Fk[] = [];

let out = '-- OTOMATİK ÜRETİLDİ (scripts/gen-pg-schema.ts). Elle düzenlemeyin.\n';
out += '-- Postgres konsolide şema — SQLite son şemasından çevrildi (#2).\n\n';

const FK_RE =
  /,?\s*FOREIGN KEY\s*\([^)]*\)\s*REFERENCES\s+\w+\s*\([^)]*\)(\s+ON DELETE (?:CASCADE|SET NULL|RESTRICT|NO ACTION))?(\s+ON UPDATE (?:CASCADE|SET NULL|RESTRICT|NO ACTION))?/gi;

for (const t of tables) {
  let sql = t.sql;
  // inline FK'leri çıkar + topla
  sql = sql.replace(FK_RE, (m) => {
    fks.push({ table: t.name, clause: m.replace(/^\s*,/, '').trim() });
    return '';
  });
  // tip çevirileri (DATETIME önce — DATE alt-dizesi DATETIME'da çakışmasın)
  sql = sql.replace(/\bDATETIME\b/gi, 'TEXT');
  sql = sql.replace(/\bDATE\b/gi, 'TEXT');
  sql = sql.replace(/DEFAULT CURRENT_TIMESTAMP/gi, "DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')");
  sql = sql.replace(/CREATE TABLE\s+/i, 'CREATE TABLE IF NOT EXISTS ');
  // FK çıkarımından kalan virgül/parantez temizliği
  sql = sql.replace(/,(\s*,)+/g, ',');
  sql = sql.replace(/,\s*\)/g, '\n)');
  sql = sql.replace(/\(\s*,/g, '(');
  out += sql.trim() + ';\n\n';
}

// FK'ler — adlandırılmış + idempotent (duplicate_object yut)
let fkN = 0;
for (const fk of fks) {
  fkN += 1;
  const cname = `fk_${fk.table}_${fkN}`;
  out += `DO $$ BEGIN\n  ALTER TABLE ${fk.table} ADD CONSTRAINT ${cname} ${fk.clause};\nEXCEPTION WHEN duplicate_object THEN NULL; END $$;\n\n`;
}

for (const idx of indexes) {
  const sql = idx.sql
    .replace(/CREATE UNIQUE INDEX\s+/i, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
    .replace(/CREATE INDEX\s+/i, 'CREATE INDEX IF NOT EXISTS ');
  out += sql.trim() + ';\n';
}

const target = resolve(process.cwd(), 'src/db/schema.pg.sql');
writeFileSync(target, out, 'utf8');
console.log(
  `schema.pg.sql üretildi → ${target}\n  ${tables.length} tablo, ${fks.length} FK, ${indexes.length} index`
);
