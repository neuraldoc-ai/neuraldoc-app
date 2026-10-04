import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseCode, parseSQL, resolveJava, resolveTypeScript, sqlObjects } from './code-analysis.mjs'

test('multiline Java methods have exact boundaries; comments and strings do not create calls', async () => {
  const a = await parseCode('p/A.java', `package p;
    class A {
      int first(
        int x
      ) { return second(x); }
      int second(int y) { /* first(y); */ String s = "first(y)"; return y; }
    }`)
  assert.deepEqual(a.errors, [])
  assert.deepEqual(a.functions.map((s) => s.name), ['first', 'second'])
  assert.ok(!a.functions[0].body.includes('String s'))
  const result = resolveJava([a])
  assert.equal(result.edges.filter((e) => e.kind === 'calls').length, 1)
  assert.equal(result.edges[0].source, a.functions[0].id)
})
test('Java resolution respects packages, explicit imports, shadowing and ambiguous overloads', async () => {
  const b = await parseCode('p/B.java', 'package p; class B { int run(int x) { return x; } }')
  const unrelated = await parseCode('q/B.java', 'package q; class B { int run(int x) { return x; } }')
  const a = await parseCode('p/A.java', 'package p; class A { B b; int yes() { return b.run(1); } int no(String b) { return b.run(1); } }')
  const result = resolveJava([a, b, unrelated])
  assert.equal(result.edges.filter((e) => e.kind === 'calls').length, 1)
  assert.equal(result.edges.find((e) => e.kind === 'calls').target, b.functions[0].id)
  assert.ok(result.unresolved.some((c) => c.receiver === 'b'))
  const ambiguous = await parseCode('p/B.java', 'package p; class B { int run(int x) { return x; } int run(String x) { return 0; } }')
  assert.equal(resolveJava([a, ambiguous]).edges.filter((e) => e.kind === 'calls').length, 0)
  const imported = await parseCode('p/C.java', 'package p; import q.B; class C { B b; int yes() { return b.run(1); } }')
  assert.ok(resolveJava([imported, b, unrelated]).edges.some((e) => e.target === unrelated.functions[0].id))
})
test('Kotlin and Pascal have real trees; incomplete syntax is exposed', async () => {
  const k = await parseCode('A.kt', 'package p\nclass A { fun run(x: Int): Int { return x } }')
  const p = await parseCode('A.pas', 'unit A; interface procedure Run; implementation procedure Run; begin end; end.')
  assert.equal(k.functions[0].name, 'run')
  assert.equal(p.functions[0].name, 'Run')
  assert.equal(p.functions.length, 1, 'only implementation, not interface declaration')
  assert.ok((await parseCode('Broken.java', 'class A { void broken( {')).errors.length)
})
test('TypeScript compiler resolves a local import and call; missing SDK symbols stay unresolved', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neuraldoc-parser-'))
  try {
    const inputs = { 'a.ts': 'import {run, arrow} from "./b"; export function caller() { run(); arrow(); missing(); }', 'b.ts': 'export function run() { return 1; } export const arrow = () => 2;' }
    const analyses = []
    for (const [file, text] of Object.entries(inputs)) { fs.writeFileSync(path.join(root, file), text); analyses.push(await parseCode(file, text)) }
    const result = resolveTypeScript(root, analyses)
    assert.equal(result.edges.filter((e) => e.kind === 'imports').length, 1)
    assert.equal(result.edges.filter((e) => e.kind === 'calls').length, 2)
    assert.equal(result.unresolved[0].name, 'missing')
  } finally { fs.rmSync(root, { recursive: true }) }
})
test('PostgreSQL grammar handles quoted identifiers, composite foreign keys and dynamic SQL without guessing objects', async () => {
  const ast = await parseSQL(`-- FROM bogus\nCREATE TABLE "Order" ("Id" integer, seq integer, FOREIGN KEY ("Id", seq) REFERENCES parent(id, seq)); SELECT 'FROM fake' FROM "Order"; DO $$ BEGIN EXECUTE 'CREATE TABLE dynamic_x (id int)'; END $$;`)
  const constraints = sqlObjects(ast, (o) => o.Constraint?.contype === 'CONSTR_FOREIGN')
  assert.deepEqual(constraints[0].Constraint.fk_attrs.map((x) => x.String.sval), ['Id', 'seq'])
  assert.equal(sqlObjects(ast, (o) => o.RangeVar?.relname === 'bogus' || o.RangeVar?.relname === 'fake' || o.RangeVar?.relname === 'dynamic_x').length, 0)
})
