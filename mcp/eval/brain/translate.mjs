// German documentation for English code: every section of a repository's documentation translated by Gemini, code
// blocks, code spans, names and links unchanged, headings translated. Section ids stay the same, so the ground truth
// of the English documentation applies as it is. This is the situation of a German company with English code.
//
//   node --env-file=frontend/.env.local mcp/eval/brain/translate.mjs --repo httpx [--all]
import fs from 'node:fs'
import path from 'node:path'
import { REPOS } from './repos.mjs'
import { snapshot } from './snapshot.mjs'
import { brainDir } from './mine.mjs'
import { ask, spent } from './llm.mjs'

const arg = (n, d) => process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d
const SYSTEM = 'You translate one section of software documentation from English into German, the way a German technical writer at a German company would write it for German colleagues. Translate prose, headings, list items and table text. Keep unchanged: code blocks, inline code in backticks, identifiers, file paths, URLs, link targets, command lines, configuration keys and Markdown structure (heading levels, lists, tables). Do not add or drop content. Return the translated section as `text`.'
const SCHEMA = { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }

for (const name of arg('--repo').split(',')) {
  const r = REPOS.find((x) => x.name === name), snap = snapshot(r.name, r.ref)
  const gt = JSON.parse(fs.readFileSync(path.join(brainDir, `${name}.gt.json`), 'utf8'))
  // The sections with ground truth and the other sections of their documents (the document context uses them).
  const docs = new Set(gt.links.map((l) => l.doc))
  const todo = snap.docFiles.filter((s) => process.argv.includes('--all') || docs.has(s.path))
  const out = {}, file = path.join(brainDir, `${name}.de.json`)
  let done = 0
  const queue = [...todo]
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      const { value } = await ask({ purpose: `translate-${name}`, system: SYSTEM, content: { section: s.text }, schema: SCHEMA })
      out[s.id] = value.text
      if (++done % 20 === 0) process.stderr.write(`  ${name}: ${done}/${todo.length}, ${spent().toFixed(3)} USD\r`)
    }
  }))
  fs.writeFileSync(file, JSON.stringify(out, null, 1))
  console.log(`${name}: ${todo.length} Abschnitte übersetzt, Ausgaben bisher ${spent().toFixed(3)} USD`)
}
