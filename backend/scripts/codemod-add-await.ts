/**
 * Codemod #2: async fonksiyonlara yapılan SONUÇ-KULLANILAN (await'siz) çağrılara
 * `await` ekler → caller cascade'i çözer.
 *
 * Güvenlik: yalnız sonucu KULLANILAN çağrılar (bare ExpressionStatement = fire-and-forget
 * DOKUNULMAZ). `.then`/`.catch` alıcısı, `void`, top-level (CommonJS) atlanır.
 * NonNull(!)/Paren içinden geçerek await sarmalı mı bakılır (istifleme önlenir).
 * `getX()!` → `(await getX())!` (öncelik korunur).
 * Kullanım: tsx scripts/codemod-add-await.ts <tüm hedef dosyalar>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as ts from 'typescript';

const files = process.argv.slice(2);

const isAsyncNode = (node: ts.Node): boolean => {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return !!mods?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
};

// 1) Tüm async fonksiyon adlarını topla (cross-file)
const asyncNames = new Set<string>();
const sources = new Map<string, ts.SourceFile>();
for (const file of files) {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  sources.set(file, sf);
  const walk = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name && isAsyncNode(node)) asyncNames.add(node.name.text);
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
      const init = node.initializer;
      if ((ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && isAsyncNode(init)) {
        asyncNames.add(node.name.text);
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
}

let total = 0;
for (const file of files) {
  const sf = sources.get(file)!;
  let src = sf.getFullText();
  const insideFunction = (node: ts.Node): boolean => {
    let p = node.parent;
    while (p) {
      if (ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isArrowFunction(p) || ts.isMethodDeclaration(p)) return true;
      p = p.parent;
    }
    return false;
  };
  const inserts: { pos: number; text: string }[] = [];
  const walk = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && asyncNames.has(node.expression.text)) {
      let eff: ts.Node | undefined = node.parent;
      while (eff && (ts.isNonNullExpression(eff) || ts.isParenthesizedExpression(eff))) eff = eff.parent;
      const alreadyAwaited = eff && ts.isAwaitExpression(eff);
      const isStatement = eff && ts.isExpressionStatement(eff);
      const isVoided = eff && ts.isVoidExpression(eff);
      const isChainReceiver = eff && ts.isPropertyAccessExpression(eff); // fn().then()/.prop → atla (elle)
      const topLevel = !insideFunction(node);
      if (!alreadyAwaited && !isStatement && !isVoided && !isChainReceiver && !topLevel) {
        if (ts.isNonNullExpression(node.parent)) {
          inserts.push({ pos: node.getStart(sf), text: '(await ' });
          inserts.push({ pos: node.getEnd(), text: ')' });
        } else {
          inserts.push({ pos: node.getStart(sf), text: 'await ' });
        }
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  if (inserts.length === 0) continue;
  inserts.sort((a, b) => b.pos - a.pos);
  for (const ins of inserts) src = src.slice(0, ins.pos) + ins.text + src.slice(ins.pos);
  const n = inserts.filter((x) => x.text.includes('await')).length;
  writeFileSync(file, src, 'utf8');
  total += n;
  console.log(`${file}: +${n} await`);
}
console.log(`\nToplam: ${total} await (${asyncNames.size} async fn)`);
