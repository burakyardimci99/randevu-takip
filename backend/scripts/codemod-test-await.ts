/**
 * Codemod #2 (test pası): test dosyalarını async servis API'sine uyarlar.
 *  - expect(() => asyncFn(...)).toThrow(X) / .toThrowError(X)
 *      → await expect(asyncFn(...)).rejects.toThrow(X)
 *  - sonuç-kullanılan asyncFn(...) → await asyncFn(...)  (expect-arrow dışında)
 *  - it/test/beforeAll callback'lerini async yap (içinde await varsa)
 *
 * asyncNames src + tests'ten toplanır. ÇIKTI vitest ile doğrulanır.
 * Kullanım: tsx scripts/codemod-test-await.ts <test dosyaları> --scan <src dosyaları>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as ts from 'typescript';

const argv = process.argv.slice(2);
const scanIdx = argv.indexOf('--scan');
const testFiles = scanIdx === -1 ? argv : argv.slice(0, scanIdx);
const scanFiles = scanIdx === -1 ? [] : argv.slice(scanIdx + 1);

const isAsyncNode = (node: ts.Node): boolean => {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return !!mods?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
};

// async fn adlarını topla
const asyncNames = new Set<string>();
for (const file of [...scanFiles, ...testFiles]) {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const walk = (n: ts.Node): void => {
    if (ts.isFunctionDeclaration(n) && n.name && isAsyncNode(n)) asyncNames.add(n.name.text);
    if (ts.isVariableDeclaration(n) && n.initializer && ts.isIdentifier(n.name) &&
        (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)) && isAsyncNode(n.initializer)) {
      asyncNames.add(n.name.text);
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
}

const isAsyncCall = (node: ts.Node): node is ts.CallExpression =>
  ts.isCallExpression(node) && ts.isIdentifier(node.expression) && asyncNames.has(node.expression.text);

for (const file of testFiles) {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let src = sf.getFullText();
  const edits: { start: number; end: number; text: string }[] = [];
  const handledCalls = new Set<ts.Node>();

  // 1) expect(() => asyncCall(...)).toThrow|toThrowError(X) → await expect(asyncCall(...)).rejects.toThrow(X)
  const walkThrow = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      (node.expression.name.text === 'toThrow' || node.expression.name.text === 'toThrowError')
    ) {
      const expectCall = node.expression.expression; // expect(...)
      if (
        ts.isCallExpression(expectCall) &&
        ts.isIdentifier(expectCall.expression) &&
        expectCall.expression.text === 'expect' &&
        expectCall.arguments.length === 1
      ) {
        const arg = expectCall.arguments[0];
        let inner: ts.Expression | undefined;
        if (ts.isArrowFunction(arg) && !ts.isBlock(arg.body)) inner = arg.body; // () => CALL
        if (inner && isAsyncCall(inner)) {
          handledCalls.add(inner);
          const throwArgs = node.arguments.map((a) => a.getText(sf)).join(', ');
          edits.push({
            start: node.getStart(sf),
            end: node.getEnd(),
            text: `await expect(${inner.getText(sf)}).rejects.toThrow(${throwArgs})`,
          });
        }
      }
    }
    ts.forEachChild(node, walkThrow);
  };
  walkThrow(sf);

  // 2) diğer sonuç-kullanılan async çağrılara await (expect-arrow dışındaki + handled olmayan)
  const walkAwait = (node: ts.Node): void => {
    if (isAsyncCall(node) && !handledCalls.has(node)) {
      let eff: ts.Node | undefined = node.parent;
      while (eff && (ts.isNonNullExpression(eff) || ts.isParenthesizedExpression(eff))) eff = eff.parent;
      const alreadyAwaited = eff && ts.isAwaitExpression(eff);
      const isStatement = eff && ts.isExpressionStatement(eff);
      const isChainRecv = eff && ts.isPropertyAccessExpression(eff);
      if (!alreadyAwaited && !isChainRecv) {
        // statement bile olsa testte await isteriz (deterministiklik)
        edits.push({ start: node.getStart(sf), end: node.getStart(sf), text: 'await ' });
        void isStatement;
      }
    }
    ts.forEachChild(node, walkAwait);
  };
  walkAwait(sf);

  // 3) it/test/beforeAll/afterAll/beforeEach callback'lerini async yap (arrow, async değilse)
  const walkCb = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ['it', 'test', 'beforeAll', 'afterAll', 'beforeEach', 'afterEach'].includes(node.expression.text)
    ) {
      const cb = node.arguments[node.arguments.length - 1];
      if (cb && ts.isArrowFunction(cb) && !isAsyncNode(cb)) {
        edits.push({ start: cb.getStart(sf), end: cb.getStart(sf), text: 'async ' });
      }
    }
    ts.forEachChild(node, walkCb);
  };
  walkCb(sf);

  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  // çakışan edit'leri ele (aynı pozisyon)
  for (const e of edits) src = src.slice(0, e.start) + e.text + src.slice(e.end);
  writeFileSync(file, src, 'utf8');
  console.log(`${file}: ${edits.length} edit`);
}
