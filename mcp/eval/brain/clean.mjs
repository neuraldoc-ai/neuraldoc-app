// Clean-up of documentation, measured on the maintainers' own later fixes. On an older release (at least a year before
// the snapshot) the brain lists (a) interface names no document mentions and (b) names the documentation mentions that
// no code contains. Ground truth: (a) names the maintainers documented by the snapshot while the code already had them,
// (b) names they removed from the documentation by the snapshot. Nobody who knows the answer is involved.
//
//   node mcp/eval/brain/clean.mjs [--repo ky] [--split dev|test]
import { REPOS } from './repos.mjs'
import { git, snapshot } from './snapshot.mjs'
import { createBrain, docVocabulary, undocumented, deadMentions, mentions } from '../../code-brain.mjs'

const arg = (n, d) => process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d
const only = arg('--repo')?.split(','), split = arg('--split')
const codeLike = (n) => n.length >= 4 && /[a-z][A-Z]|_|^--|^[A-Z][A-Z0-9]+_|\.[a-z]/.test(n)

/** The newest tag at least a year older than the snapshot. */
function olderRef(repo, ref) {
  const at = Number(git(repo, 'log', '-1', '--format=%ct', ref).trim())
  const tags = git(repo, 'for-each-ref', '--sort=-creatordate', '--format=%(refname:short) %(creatordate:unix)', 'refs/tags').split('\n').filter(Boolean).map((l) => l.split(' '))
  return tags.find(([t, d]) => Number(d) <= at - 365 * 86400 && !/rc|alpha|beta|pre|M\d/i.test(t))?.[0]
}

const rows = []
for (const r of REPOS.filter((r) => (!only || only.includes(r.name)) && (!split || r.split === split))) {
  const old = olderRef(r.name, r.ref)
  if (!old) { console.log(`${r.name}: kein Release ein Jahr davor`); continue }
  const a = snapshot(r.name, old), b = snapshot(r.name, r.ref)
  const brainA = createBrain(a.files, { docPaths: a.docFiles.map((s) => s.path) }), brainB = createBrain(b.files, { docPaths: b.docFiles.map((s) => s.path) })
  const vocabA = docVocabulary(a.docFiles), vocabB = docVocabulary(b.docFiles)
  const inCode = (brain, n) => brain.tokenDf.has(n)

  // (a) Undocumented: listed on the old release; ground truth = documented by the snapshot, in the code all along.
  const list = undocumented(brainA, vocabA, { limit: 100000 })
  const truth = new Set(list.map((x) => x.name).filter((n) => vocabB.exact.has(n) && inCode(brainB, n)))
  // Every interface name the old documentation lacked that it gained later, also those our list does not have.
  const gained = [...vocabB.exact].filter((n) => codeLike(n) && !vocabA.exact.has(n) && !vocabA.lower.has(n.toLowerCase()) && inCode(brainA, n) && inCode(brainB, n))
  const at = (k) => list.slice(0, k).filter((x) => truth.has(x.name)).length
  // Baseline: the same candidates in file order (what a reviewer would see without ranking).
  const plain = [...list].sort((x, y) => x.path.localeCompare(y.path) || x.line - y.line)
  const atPlain = (k) => plain.slice(0, k).filter((x) => truth.has(x.name)).length
  const noPrior = undocumented(brainA, vocabA, { limit: 100000, prior: false })
  const atNoPrior = (k) => noPrior.slice(0, k).filter((x) => truth.has(x.name)).length

  // (b) Dead mentions on the old release; ground truth = removed from the documentation by the snapshot.
  const dead = deadMentions(brainA, a.docFiles)
  const mentionedB = new Set(b.docFiles.flatMap((s) => mentions(s.text).names.map((m) => m.name)))
  const removed = dead.filter((d) => !mentionedB.has(d.name) && !vocabB.exact.has(d.name))
  rows.push({ repo: r.name, split: r.split, old, listed: list.length, gained: gained.length, covered: truth.size, at25: at(25), at50: at(50), at100: at(100), plain50: atPlain(50), noprior50: atNoPrior(50), dead: dead.length, removed: removed.length, examples: { undocumented: list.slice(0, 5).map((x) => `${x.name} (${x.kind}, ${x.path}:${x.line})`), truth: [...truth].slice(0, 5), dead: dead.slice(0, 5).map((d) => d.name), removed: removed.slice(0, 5).map((d) => d.name) } })
  const x = rows.at(-1)
  console.log(`${r.name.padEnd(20)} ${r.split.padEnd(4)} ${old.padEnd(14)} undokumentiert ${String(x.listed).padStart(5)} · später dokumentiert ${String(x.covered).padStart(3)} von ${String(x.gained).padStart(3)} · davon in Top 25/50/100: ${x.at25}/${x.at50}/${x.at100} (ohne Abdeckungs-Prior ${x.noprior50}, Dateireihenfolge ${x.plain50}) · tote Verweise ${String(x.dead).padStart(3)}, später entfernt ${x.removed}`)
}
if (process.argv.includes('--examples')) for (const x of rows) console.log(x.repo, JSON.stringify(x.examples))
