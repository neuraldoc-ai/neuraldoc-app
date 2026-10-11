import test from 'node:test'
import assert from 'node:assert/strict'
import { headingsOf, sections, sectionHeading, documentTitle } from './doc-text.mjs'
import { definitions, mentions, buildCodeBrain } from './code-brain.mjs'

test('headings of Markdown, reStructuredText and AsciiDoc, never inside code blocks', () => {
  const md = '# Title\n\nText\n\n```sh\n# not a heading\n```\n\nSetext\n------\n\n### Deep `code`\n'
  assert.deepEqual(headingsOf(md, 'a.md').map((h) => [h.line, h.level, h.title]), [[0, 1, 'Title'], [8, 2, 'Setext'], [11, 3, 'Deep code']])
  const rst = '=========\nQuickstart\n=========\n\nIntro\n\nRouting\n-------\n\nText\n\nVariable Rules\n~~~~~~~~~~~~~~\n\nMore\n\nOther\n-----\n'
  assert.deepEqual(headingsOf(rst, 'q.rst').map((h) => [h.line, h.level, h.title]), [[0, 1, 'Quickstart'], [6, 2, 'Routing'], [11, 3, 'Variable Rules'], [16, 2, 'Other']])
  const adoc = '= Guide\n\n== Events\n\n----\n== not a heading\n----\n\n=== Publication\n'
  assert.deepEqual(headingsOf(adoc, 'g.adoc').map((h) => [h.level, h.title]), [[1, 'Guide'], [2, 'Events'], [3, 'Publication']])
})

test('reStructuredText and AsciiDoc are cut at their own headings into exact slices', () => {
  const body = 'x '.repeat(260)
  const rst = `Quickstart\n==========\n\n${body}\n\nRouting\n-------\n\n${body}\n`
  const parts = sections(rst, { file: 'docs/quickstart.rst' })
  assert.equal(parts.length, 2)
  assert.equal(parts.join(''), rst)
  assert.ok(parts[1].startsWith('Routing\n-------'))
  assert.equal(sectionHeading(parts[1], 'docs/quickstart.rst'), 'Routing')
  assert.equal(documentTitle(rst, 'docs/quickstart.rst'), 'Quickstart')
  const adoc = `= Events\n\n${body}\n\n== Publication registry\n\n${body}\n`
  const cut = sections(adoc, { file: 'src/docs/events.adoc' })
  assert.deepEqual(cut.map((p) => sectionHeading(p, 'events.adoc')), ['Events', 'Publication registry'])
  assert.equal(sections(rst).length, 1, 'without a file name the text is Markdown and has no Markdown heading')
})

test('definitions in any language: declarations, members, parameters, keys and exposed strings', () => {
  const names = (path, text) => definitions({ path, text }).map((d) => `${d.kind}:${d.name}`)
  assert.deepEqual(names('client.py', 'class Client:\n    def send(self, request, *, follow_redirects=False):\n        return os.environ.get("HTTPX_TIMEOUT")\n'),
    ['type:Client', 'function:send', 'param:request', 'param:follow_redirects', 'string:HTTPX_TIMEOUT'])
  assert.deepEqual(names('cors.go', 'package cors\n\ntype Config struct {\n\tAllowOrigins string\n}\n\nfunc (c *Config) New(config ...Config) fiber.Handler {\n'),
    ['type:Config', 'member:AllowOrigins', 'function:New', 'param:config'])
  assert.ok(names('Cache.kt', 'class Cache(val directory: File) {\n  fun evictAll() {}\n  companion object { const val MAX_SIZE = 10 }\n}').includes('function:evictAll'))
  assert.ok(names('Router.java', 'public class Router {\n  public static final int DEFAULT_PORT = 8080;\n  public Route route(String path) {\n').includes('value:DEFAULT_PORT'))
  assert.ok(names('options.ts', 'export interface Options {\n  retryLimit?: number\n  timeout: number | false\n}\n').includes('member:retryLimit'))
  assert.deepEqual(names('application.yml', 'spring:\n  modulith:\n    events:\n      republish: true\n'), ['key:spring', 'key:spring', 'key:modulith', 'key:spring.modulith', 'key:events', 'key:spring.modulith.events', 'key:republish', 'key:spring.modulith.events.republish'])
})

test('mentions: qualified names, imports in code blocks, roles, links; admonitions are not names', () => {
  const m = mentions('## CORS\n\n:::caution\nCheck `AllowOrigins`.\n:::\n\n```go\nimport "github.com/gofiber/fiber/v3/middleware/cors"\n\napp.Use(cors.New(cors.Config{AllowCredentials: true}))\n// cors.Ignored in a comment\n```\n\nSee :class:`flask.Flask` and [the source](src/cors.go).\n')
  const by = new Map(m.names.map((n) => [n.name, n]))
  assert.ok(m.modules.includes('github.com/gofiber/fiber/v3/middleware/cors'))
  assert.deepEqual(by.get('New').qualifiers, ['cors'])
  assert.deepEqual(by.get('AllowOrigins').where, ['span'])
  assert.ok(by.has('Flask') && by.has('AllowCredentials'))
  assert.ok(!by.has('caution') && !by.has('Ignored'))
  assert.ok(m.paths.includes('src/cors.go'))
})

const project = {
  files: [
    { path: 'src/retry.ts', text: 'export interface RetryOptions {\n  limit: number\n  backoffLimit: number\n}\nexport function computeDelay(options: RetryOptions, attempt: number) {\n  return Math.min(options.backoffLimit, 0.3 * 2 ** attempt)\n}\n' },
    { path: 'src/client.ts', text: 'import { computeDelay } from "./retry"\nexport class Client {\n  async send(request: Request) {\n    const timeout = Number(process.env.CLIENT_TIMEOUT_MS ?? 10000)\n    return fetch(request, { signal: AbortSignal.timeout(timeout) })\n  }\n}\n' },
    { path: 'middleware/cors/cors.go', text: 'package cors\n\n// New creates a CORS middleware.\nfunc New(config ...Config) fiber.Handler {\n\tcfg := configDefault(config...)\n\treturn func(c fiber.Ctx) error { return c.Next() }\n}\n' },
    { path: 'middleware/cors/config.go', text: 'package cors\n\ntype Config struct {\n\tAllowOrigins []string\n\tAllowCredentials bool\n\tMaxAge int\n}\n\nvar ConfigDefault = Config{AllowOrigins: []string{"*"}}\n' },
    { path: 'go.mod', text: 'module github.com/acme/web\n\ngo 1.22\n' },
    { path: 'test/retry.test.ts', text: 'import { computeDelay } from "../src/retry"\ntest("backoffLimit caps the delay", () => { expect(computeDelay({ limit: 2, backoffLimit: 100 }, 9)).toBe(100) })\n' },
    { path: 'docs/docusaurus.config.js', text: 'module.exports = { title: "Retries and CORS", themeConfig: { navbar: { items: ["retry", "cors"] } } }\n' },
  ],
  docFiles: [
    { id: 's1', source: 'readme', path: 'README.md', heading: 'Retries', text: '## Retries\n\nFailed requests are retried. `limit` sets how often; `backoffLimit` caps the delay between attempts.\n\n```ts\nconst client = new Client({ retry: { limit: 3, backoffLimit: 3000 } })\n```\n' },
    { id: 's2', source: 'cors', path: 'docs/middleware/cors.md', heading: 'CORS', text: '## CORS\n\nThe CORS middleware answers preflight requests.\n\n```go\nimport "github.com/acme/web/middleware/cors"\n\napp.Use(cors.New(cors.Config{AllowOrigins: []string{"https://example.com"}, MaxAge: 3600}))\n```\n\n`AllowHeaders` lists the headers a browser may send.\n' },
    { id: 's3', source: 'betrieb', path: 'docs/betrieb.md', heading: 'Zeitlimit', text: '## Zeitlimit\n\nDer Client bricht eine Anfrage nach `CLIENT_TIMEOUT_MS` Millisekunden ab (Standard 10.000).\n' },
  ],
}

test('the brain links each section to the code it describes, with reasons, and leaves tests and the docs site out', () => {
  const brain = buildCodeBrain(project)
  const top = (id) => brain.links[id]?.[0]?.path
  assert.equal(top('s1'), 'src/retry.ts')
  assert.ok(brain.links.s2.slice(0, 2).every((l) => l.path.startsWith('middleware/cors/')), JSON.stringify(brain.links.s2))
  assert.equal(top('s3'), 'src/client.ts', 'a German section finds the code through the name it mentions')
  const all = Object.values(brain.links).flat()
  assert.ok(all.every((l) => !l.path.startsWith('test/') && !l.path.includes('docusaurus')))
  assert.ok(all.every((l) => l.p >= brain.threshold && l.why.length))
  assert.ok(brain.links.s1[0].names.some((n) => n.startsWith('backoffLimit:')))
  assert.deepEqual(brain.tests.s1, ['test/retry.test.ts'])
  assert.ok(brain.files['src/retry.ts'].includes('s1'))
  assert.deepEqual(buildCodeBrain(project).links, brain.links, 'deterministic')
})

test('clean-up: interface names no document mentions and documented names no code has', () => {
  const { cleanup } = buildCodeBrain(project)
  assert.ok(cleanup.undocumented.some((u) => u.name === 'AllowCredentials' && u.path === 'middleware/cors/config.go'))
  assert.ok(!cleanup.undocumented.some((u) => u.name === 'backoffLimit' || u.name === 'CLIENT_TIMEOUT_MS'), 'documented names are not listed')
  assert.deepEqual(cleanup.dead.map((d) => d.name), ['AllowHeaders'])
  assert.deepEqual(cleanup.dead[0].sections, ['s2'])
})
