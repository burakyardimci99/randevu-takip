/**
 * Codemod (#2): getDb().prepare(SQL).get/all/run(args) → await dbOne/dbAll/dbRun(SQL, [args])
 * ve getDb().exec(SQL) → await dbExec(SQL). Dengeli-parantez tabanlı (regex'ten güvenli).
 *
 * Dönüştürmez (elle/tsc ile): db.transaction(...), `const db = getDb()`, ham `.pragma`.
 * `await` ekler → tsc "await only in async fn" ile fonksiyonları async yapmamızı söyler.
 *
 * Kullanım: tsx scripts/codemod-async-db.ts <dosya1> [dosya2 ...]   (--dry ile önizleme)
 */
import { readFileSync, writeFileSync } from 'node:fs';

const DRY = process.argv.includes('--dry');
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));

/** s[open] bir '(' ; eşleşen ')' indeksini döner (string/template literal farkında). */
function matchParen(s: string, open: number): number {
  let depth = 0;
  let i = open;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') {
      // string literal atla (template `${}` basitçe — iç ( sayılmaz; bu kod tabanında prepare SQL'inde ${} yok)
      const quote = c;
      i++;
      while (i < s.length && s[i] !== quote) {
        if (s[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

const METHODS: Record<string, string> = { get: 'dbOne', all: 'dbAll', run: 'dbRun' };

function transform(src: string): { out: string; count: number; flags: string[] } {
  let out = '';
  let i = 0;
  let count = 0;
  const flags: string[] = [];

  while (i < src.length) {
    // ".prepare(" ara — öncesinde getDb() veya identifier (db) olmalı
    const prepIdx = src.indexOf('.prepare(', i);
    if (prepIdx === -1) {
      out += src.slice(i);
      break;
    }

    // prefix'in başını bul (getDb() ya da identifier). prepIdx'ten geriye git.
    let pstart = prepIdx;
    // "getDb()" mı?
    const before = src.slice(0, prepIdx);
    let prefix = '';
    const mGetDb = before.match(/getDb\(\)\s*$/);
    const mIdent = before.match(/([A-Za-z_$][\w$]*)\s*$/);
    if (mGetDb) {
      prefix = 'getDb()';
      pstart = prepIdx - mGetDb[0].length;
    } else if (mIdent) {
      prefix = mIdent[1];
      pstart = prepIdx - mIdent[0].length;
    } else {
      // tanımsız — atla
      out += src.slice(i, prepIdx + '.prepare('.length);
      i = prepIdx + '.prepare('.length;
      continue;
    }

    const sqlOpen = prepIdx + '.prepare'.length; // '(' konumu
    const sqlClose = matchParen(src, sqlOpen);
    if (sqlClose === -1) {
      out += src.slice(i, prepIdx + 1);
      i = prepIdx + 1;
      continue;
    }
    const sqlExpr = src.slice(sqlOpen + 1, sqlClose).trim();

    // sqlClose sonrası ".get(" / ".all(" / ".run(" bekle (boşluk/yeni satır olabilir)
    const after = src.slice(sqlClose + 1);
    const mMethod = after.match(/^\s*\.(get|all|run)\(/);
    if (!mMethod) {
      // prepare ama get/all/run değil (örn. .pluck / saklanan stmt) → flag, dokunma
      flags.push(`prepare-without-direct-call @${prepIdx}`);
      out += src.slice(i, sqlClose + 1);
      i = sqlClose + 1;
      continue;
    }
    const method = mMethod[1];
    const argsOpenRel = mMethod[0].length - 1; // '(' konumu (after içinde)
    const argsOpenAbs = sqlClose + 1 + argsOpenRel;
    const argsClose = matchParen(src, argsOpenAbs);
    if (argsClose === -1) {
      out += src.slice(i, sqlClose + 1);
      i = sqlClose + 1;
      continue;
    }
    const argsExpr = src.slice(argsOpenAbs + 1, argsClose).trim();

    // Çıktı: prefix..method() bloğunu değiştir
    out += src.slice(i, pstart);
    const fn = METHODS[method];
    const argArr = argsExpr.length ? `[${argsExpr}]` : `[]`;
    out += `await ${fn}(${sqlExpr}, ${argArr})`;
    count++;
    i = argsClose + 1;
  }

  // getDb().exec(  → await dbExec(   (db.exec de)
  let out2 = out.replace(/getDb\(\)\.exec\(/g, () => {
    count++;
    return 'await dbExec(';
  });

  return { out: out2, count, flags };
}

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const { out, count, flags } = transform(src);
  if (DRY) {
    console.log(`\n--- ${file} (${count} dönüşüm, ${flags.length} flag) ---`);
    if (flags.length) console.log('  FLAGS:', flags.join('; '));
  } else {
    writeFileSync(file, out, 'utf8');
    console.log(`${file}: ${count} dönüşüm${flags.length ? `, ${flags.length} flag (${flags.join('; ')})` : ''}`);
  }
}
