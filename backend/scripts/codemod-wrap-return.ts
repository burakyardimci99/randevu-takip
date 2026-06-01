/**
 * Codemod #2: async yapılan ama dönüş tipi Promise OLMAYAN fonksiyonları sarar.
 *   async fn(): T  →  async fn(): Promise<T>   (TS1064 giderir)
 * Kullanım: tsx scripts/codemod-wrap-return.ts <dosya...>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as ts from 'typescript';

for (const file of process.argv.slice(2)) {
  let src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const inserts: { pos: number; text: string }[] = [];
  const isAsync = (node: ts.Node): boolean => {
    const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return !!mods?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
  };
  const isPromise = (t: ts.TypeNode): boolean =>
    ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName) && t.typeName.text === 'Promise';
  const walk = (node: ts.Node): void => {
    if (
      (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) &&
      isAsync(node) && node.type && !isPromise(node.type)
    ) {
      inserts.push({ pos: node.type.getStart(sf), text: 'Promise<' });
      inserts.push({ pos: node.type.getEnd(), text: '>' });
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  inserts.sort((a, b) => b.pos - a.pos);
  for (const ins of inserts) src = src.slice(0, ins.pos) + ins.text + src.slice(ins.pos);
  writeFileSync(file, src, 'utf8');
  console.log(`${file}: ${inserts.length / 2} dönüş tipi sarıldı`);
}
