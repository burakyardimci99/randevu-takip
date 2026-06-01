/**
 * Codemod #2 (transaction): better-sqlite3 transaction → dbTx (ALS sayesinde gövde aynı kalır).
 *   const txn = db.transaction(async () => { BODY });  ...  PREFIX txn();
 *   →  (decl silinir)                                       PREFIX await dbTx(async () => { BODY });
 *
 * BODY-MIXING FIX: her declaration, kendisinden SONRAKİ en yakın aynı-adlı invocation
 * ile eşlenir (global name→body map YOK). Aynı `txn` adı farklı fonksiyonlarda güvenli.
 * Yalnız PARAMETRESİZ transaction (txn() argümansız). Param'lı → SKIP (flag, elle).
 * ÇIKTI ELLE DOĞRULANMALI. Kullanım: tsx scripts/codemod-transaction.ts <dosya...>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as ts from 'typescript';

for (const file of process.argv.slice(2)) {
  let src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  interface Decl { name: string; bodyText: string; stmtStart: number; stmtEnd: number; declEnd: number; }
  interface Inv { name: string; start: number; end: number; }
  const decls: Decl[] = [];
  const invs: Inv[] = [];
  let skipped = 0;

  const findDecls = (node: ts.Node): void => {
    if (ts.isVariableStatement(node) && node.declarationList.declarations.length === 1) {
      const d = node.declarationList.declarations[0];
      if (
        d.initializer && ts.isCallExpression(d.initializer) &&
        ts.isPropertyAccessExpression(d.initializer.expression) &&
        d.initializer.expression.name.text === 'transaction' &&
        d.initializer.arguments.length === 1 && ts.isIdentifier(d.name)
      ) {
        const fn = d.initializer.arguments[0];
        if ((ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && fn.body) {
          if (fn.parameters.length === 0) {
            decls.push({
              name: d.name.text, bodyText: fn.body.getText(sf),
              stmtStart: node.getFullStart(), stmtEnd: node.getEnd(), declEnd: node.getEnd(),
            });
          } else {
            skipped++;
          }
        }
      }
    }
    ts.forEachChild(node, findDecls);
  };
  findDecls(sf);

  const declNames = new Set(decls.map((d) => d.name));
  const findInvs = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
        declNames.has(node.expression.text) && node.arguments.length === 0) {
      invs.push({ name: node.expression.text, start: node.getStart(sf), end: node.getEnd() });
    }
    ts.forEachChild(node, findInvs);
  };
  findInvs(sf);

  if (decls.length === 0) { console.log(`${file}: 0 (skip param: ${skipped})`); continue; }

  // Proximity pairing: her decl → kendisinden sonraki en yakın aynı-adlı invocation
  const edits: { start: number; end: number; text: string }[] = [];
  const usedInv = new Set<Inv>();
  for (const d of decls) {
    const cand = invs
      .filter((i) => i.name === d.name && i.start > d.declEnd && !usedInv.has(i))
      .sort((a, b) => a.start - b.start)[0];
    if (!cand) { console.log(`${file}: UYARI ${d.name} invocation bulunamadı`); continue; }
    usedInv.add(cand);
    edits.push({ start: cand.start, end: cand.end, text: `await dbTx(async () => ${d.bodyText})` });
    edits.push({ start: d.stmtStart, end: d.stmtEnd, text: '' });
  }
  edits.sort((a, b) => b.start - a.start);
  for (const e of edits) src = src.slice(0, e.start) + e.text + src.slice(e.end);
  writeFileSync(file, src, 'utf8');
  console.log(`${file}: ${usedInv.size} transaction → dbTx (skip param: ${skipped})`);
}
