// Comparison table over all run reports in mcp/state/eval (latest report per benchmark and label). No model calls.
//   node mcp/eval/table.mjs [--markdown]
import fs from 'node:fs'
import path from 'node:path'
import { evalDir } from './benchmarks.mjs'

const latest = new Map()
for (const f of fs.readdirSync(evalDir).filter((f) => f.startsWith('run-')).sort()) for (const r of JSON.parse(fs.readFileSync(path.join(evalDir, f), 'utf8'))) latest.set(`${r.label}|${r.bench}`, r)
const pct = (v) => v === null || v === undefined || Number.isNaN(v) ? '–' : `${Math.round(v * 100)} %`
const rows = [...latest.values()].map((r) => {
  const d = r.drafts, drafted = d?.rows.filter((x) => x.status === 'draft') || []
  return {
    label: r.label, bench: r.bench,
    'Item-Recall': pct(r.item.recallAny), 'Abschn.-Precision': pct(r.section.precision), 'Dok.-Recall must': pct(r.doc.recallMust), 'Dok.-Precision': pct(r.doc.precision),
    'Prüfung USD': (r.jev.usd + (r.llm?.usdAll || 0)).toFixed(4),
    Entwürfe: d ? `${drafted.length}/${d.total}` : '–', 'Entwurfs-Precision': d ? pct(drafted.length ? drafted.filter((x) => x.items.length).length / drafted.length : null) : '–',
    korrekt: d?.correct ?? '–', 'falsche Aussagen': d ? `${d.withFalse} (${d.falseStatements})` : '–', 'Item-Abdeckung': d ? pct(d.itemCoverage) : '–',
    'Entwurf USD': d ? d.usd.toFixed(4) : '–', 'Modellzeit s': Math.round(r.jev.seconds),
  }
}).sort((a, b) => a.bench.localeCompare(b.bench) || a.label.localeCompare(b.label))
const cols = Object.keys(rows[0])
if (process.argv.includes('--markdown')) console.log([`| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${cols.map((c) => r[c]).join(' | ')} |`)].join('\n'))
else console.table(rows)
