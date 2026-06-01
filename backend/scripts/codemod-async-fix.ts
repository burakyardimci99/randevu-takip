/**
 * Codemod #2: (1) kullanılan dbX helper'larını schema'dan import et (TS2304),
 * (2) içinde DOĞRUDAN `await` olan ama `async` olmayan fonksiyonları async yap (TS1308).
 * AST tabanlı; sadece `async ` eklenir, formatlama korunur.
 * Kullanım: tsx scripts/codemod-async-fix.ts <dosya...>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as ts from 'typescript';

const HELPERS = ['dbAll', 'dbOne', 'dbRun', 'dbExec', 'dbTx'];

function addAsyncInserts(sf: ts.SourceFile): number[] {
  const inserts: number[] = [];
  const hasDirectAwait = (fn: ts.FunctionLikeDeclarationBase): boolean => {
    let found = false;
    const visit = (n: ts.Node): void => {
      if (found) return;
      if (
        ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) ||
        ts.isMethodDeclaration(n) || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n)
      ) return;
      if (ts.isAwaitExpression(n)) { found = true; return; }
      ts.forEachChild(n, visit);
    };
    if (fn.body) ts.forEachChild(fn.body, visit);
    return found;
  };
  const isAsync = (node: ts.Node): boolean => {
    const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return !!mods?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
  };
  const pos = (node: ts.Node): number | null => {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
      const kw = node.getChildren(sf).find((c) => c.kind === ts.SyntaxKind.FunctionKeyword);
      return kw ? kw.getStart(sf) : node.getStart(sf);
    }
    if (ts.isMethodDeclaration(node)) return node.name.getStart(sf);
    if (ts.isArrowFunction(node)) return node.getStart(sf);
    return null;
  };
  const walk = (node: ts.Node): void => {
    if (
      (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) &&
      !isAsync(node) && hasDirectAwait(node)
    ) {
      const p = pos(node);
      if (p !== null) inserts.push(p);
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return inserts;
}

function fixImports(src: string): string {
  const used = HELPERS.filter((h) => new RegExp(`\\b${h}\\b`).test(src));
  if (used.length === 0) return src;
  const importRe = /import\s*\{([^}]*)\}\s*from\s*(['"][^'"]*schema['"])/;
  const m = src.match(importRe);
  if (m) {
    const existing = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    const merged = Array.from(new Set([...existing, ...used])).sort();
    return src.replace(importRe, `import { ${merged.join(', ')} } from ${m[2]}`);
  }
  const path = src.includes("from './schema'") ? './schema' : '../db/schema';
  const firstImport = src.match(/^import .*$/m);
  const line = `import { ${used.sort().join(', ')} } from '${path}';`;
  if (firstImport) {
    const idx = src.indexOf(firstImport[0]) + firstImport[0].length;
    return src.slice(0, idx) + '\n' + line + src.slice(idx);
  }
  return line + '\n' + src;
}

for (const file of process.argv.slice(2)) {
  let src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const positions = addAsyncInserts(sf).sort((a, b) => b - a);
  for (const p of positions) src = src.slice(0, p) + 'async ' + src.slice(p);
  src = fixImports(src);
  writeFileSync(file, src, 'utf8');
  console.log(`${file}: +${positions.length} async`);
}
