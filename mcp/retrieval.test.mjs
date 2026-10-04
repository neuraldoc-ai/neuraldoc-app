import test from 'node:test'
import assert from 'node:assert/strict'
import { codeChunks, createRetriever, isTest, pick } from './retrieval.mjs'

const file = (path, text) => ({ id: `file:${path}`, path, text })

test('excerpts of about 60 lines keep their position', () => {
  const chunks = codeChunks([file('src/a.ts', Array.from({ length: 130 }, (_, i) => `line ${i + 1}`).join('\n'))])
  assert.deepEqual(chunks.map((c) => [c.start, c.end]), [[1, 65], [61, 125], [121, 130]])
})

test('tests and build scripts are recognised in common layouts', () => {
  for (const path of ['test/core.test.js', 'tests/test_client.py', 'src/__tests__/a.ts', 'test-d/core.test-d.ts', 'scripts/build.mjs', 'command_test.go', 'src/test/java/FooTest.java', 'web/a.spec.tsx', '.github/workflows/ci.yml']) assert.ok(isTest(path), path)
  for (const path of ['src/core.ts', 'httpx/_config.py', 'completions.go', 'server/src/main/java/Foo.java', 'config/test-mode.yaml']) assert.ok(!isTest(path), path)
})

test('a section gets the best excerpts, at most two per file and one from tests or scripts', () => {
  const files = [
    file('src/price.ts', 'export const discount = (total) => total >= 1000 ? 0.15 : 0.10 // discount rate'),
    file('src/report.ts', 'import { discount } from "./price"\nexport const summary = (t) => `discount ${discount(t)}`'),
    file('test/price.test.ts', 'test("discount", () => expect(discount(1000)).toBe(0.15)) // discount rate discount'),
    file('test/report.test.ts', 'test("summary discount", () => expect(summary(1)).toContain("discount")) // discount rate'),
    file('scripts/release.mjs', 'console.log("discount rate release")'),
  ]
  const ranked = createRetriever(files).rank({ title: 'Discount', text: 'The discount rate is always 10 percent.' })
  assert.ok(ranked.length >= 4)
  const chosen = pick(ranked, 6)
  assert.equal(chosen.filter((c) => isTest(c.path)).length, 1)
  assert.ok(chosen.some((c) => c.path === 'src/price.ts'))
  assert.equal(pick(ranked, 6, 2, Infinity).filter((c) => isTest(c.path)).length, 3, 'the cap can be lifted for comparisons')
})
