// The connectors behind the three neuraldoc tools: GitLab, Jira, Confluence and SharePoint.
// The agent never calls these directly. neuraldoc reads the sources itself and only hands back what
// the answer needs, which is where the token savings come from (like executor.sh, but for content).
//
// The sources are read from the example dataset (Git submodules under datasets/, see dataset.mjs). Swapping a connector for the
// real API means replacing its loader below; the tools stay the same.
import fs from 'node:fs'
import path from 'node:path'
import { dataPath } from './dataset.mjs'

const SITE = 'https://musterhaus-software.atlassian.net'

const readJson = (rel) => JSON.parse(fs.readFileSync(dataPath(rel), 'utf8'))
const readText = (rel) => (fs.existsSync(dataPath(rel)) ? fs.readFileSync(dataPath(rel), 'utf8') : '')

const db = {
  issues: readJson('jira/search_jql.json').issues,
  commits: readJson('gitlab/commits.json'),
  repository: readJson('gitlab/repository.json'),
  mrs: readJson('gitlab/merge_requests.json'),
  pages: readJson('confluence/pages.json').results,
  files: readJson('dokumente/driveItems.json').value,
  extracted: readJson('dokumente/extracted.json'),
  pageMeta: readJson('confluence/page_meta.json'),
}

/** Rough token count, the usual rule of thumb of about four characters per token. */
export const approxTokens = (s) => Math.ceil((s?.length ?? 0) / 4)

/* ---------- Atlassian text formats ---------- */

export function adfToText(node) {
  if (!node) return ''
  const kids = (n) => (n.content ?? []).map((c) => adfToText(c)).join('')
  switch (node.type) {
    case 'doc':
      return kids(node).trim()
    case 'text':
      return node.text
    case 'paragraph':
    case 'heading':
      return kids(node) + '\n'
    case 'bulletList':
    case 'orderedList':
      return node.content.map((li) => '- ' + adfToText(li).trim() + '\n').join('')
    default:
      return kids(node)
  }
}

/* ---------- Jira ---------- */

export function jiraIssue(key) {
  const i = db.issues.find((x) => x.key.toLowerCase() === String(key).trim().toLowerCase())
  if (!i) return null
  const f = i.fields
  return {
    key: i.key,
    summary: f.summary,
    type: f.issuetype.name,
    status: f.status.name,
    done: f.status.statusCategory?.key === 'done' || f.status.name === 'Fertig',
    fixVersions: f.fixVersions.map((v) => v.name),
    description: adfToText(f.description),
    comments: f.comment.comments.map((c) => ({ author: c.author.displayName, at: c.created.slice(0, 10), text: adfToText(c.body) })),
    links: f.issuelinks.map((l) => (l.outwardIssue ?? l.inwardIssue).key),
    url: `${SITE}/browse/${i.key}`,
  }
}

export const jiraText = (issue) => (issue ? [issue.summary, issue.description, ...issue.comments.map((c) => `${c.author}: ${c.text}`)].join('\n') : '')

/* ---------- GitLab ---------- */

const iidOf = (mr) => Number(String(mr).replace(/\D/g, ''))

export const mergeRequest = (mr) => db.mrs.find((m) => m.iid === iidOf(mr)) ?? null
export const mergeRequestByBranch = (branch) => db.mrs.find((m) => m.source_branch === String(branch).trim()) ?? null
export const commitBySha = (sha) => (String(sha).trim().length < 7 ? null : (db.commits.find((c) => c.id.startsWith(String(sha).trim().toLowerCase())) ?? null))
export const commitsMentioning = (ticket) => {
  const digits = String(ticket).replace(/\D/g, '')
  return db.commits.filter((c) => new RegExp(`MOB-?${digits}\\b`).test(c.message))
}

const mrCommits = new Map(db.mrs.map((m) => [m.iid, readJson(`gitlab/merge_requests/${m.iid}/commits.json`)]))
export const mergeRequestOfCommit = (sha) => db.mrs.find((m) => mrCommits.get(m.iid).some((c) => c.id === sha)) ?? null

/** Everything an agent would have to read to understand a merge request: description plus every diff. */
export function mergeRequestText(mr) {
  const m = mergeRequest(mr)
  if (!m) return ''
  return [m.title, m.description, ...mrCommits.get(m.iid).map((c) => `${c.title}\n${readText(`gitlab/commits/${c.id}/diff.json`)}`)].join('\n')
}

/** Current release files touched by this MR, with real paths and line numbers.
 * Historical diffs identify scope; facts use the final release, not an obsolete intermediate patch. */
export function mergeRequestFiles(mr) {
  const m = mergeRequest(mr)
  if (!m) return []
  const paths = new Set(mrCommits.get(m.iid).flatMap((c) => readJson(`gitlab/commits/${c.id}/diff.json`).filter((d) => !d.deleted_file).map((d) => d.new_path)))
  return [...paths].filter((p) => !/(?:^|\/)test(?:s)?\//i.test(p)).map((file) => ({ file, text: db.repository.files[file]?.content ?? '', mr: m.iid, revision: 'release/26.4', url: `https://gitlab.musterhaus-software.de/mobiq/erp/-/blob/release/26.4/${file}` }))
}

const decode = (s) => s.replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, (v) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' })[v]).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
export const htmlText = (s) => decode(s.replace(/<ri:attachment\b[^>]*ri:filename="([^"]+)"[^>]*\/?>/g, ' [Bild: $1] ').replace(/<\/(?:p|li|tr|h[1-6])>/g, '\n').replace(/<\/(?:td|th)>/g, ' | ').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim()
const extractedText = (b) => b.table ? [b.table.head.join(' | '), ...b.table.rows.map((r) => r.join(' | '))].join('\n') : b.bullets ? b.bullets.join('\n') : Object.values(b).filter((v) => typeof v === 'string').join('\n')

/** Entire connected documentation corpus. No fixture answers or ground truth are read here. */
export function sourceDocuments() {
  const pages = db.pages.map((p) => {
    const html = p.body.storage.value
    const headings = [...html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g)]
    const starts = [{ index: 0, end: 0, heading: p.title }, ...headings.map((h) => ({ index: h.index, end: h.index + h[0].length, heading: htmlText(h[2]) }))]
    const units = starts.map((h, i) => ({ section: h.heading, text: htmlText(html.slice(h.end, starts[i + 1]?.index)), html: html.slice(h.end, starts[i + 1]?.index) })).filter((u) => u.text)
    return { ...confluence(p.id), parentId: p.parentId, labels: db.pageMeta[p.id]?.labels.results.map((l) => l.name) ?? [], units }
  })
  const files = db.files.map((f) => {
    const extracted = Object.values(db.extracted).find((e) => e.id === f.id)
    const units = []
    if (extracted?.sheets) for (const sheet of extracted.sheets) units.push({ section: `Blatt ${sheet.name}`, text: sheet.rows.map((r) => r.join(' | ')).join('\n') })
    if (extracted?.pages) for (const [i, page] of extracted.pages.entries()) units.push({ section: `${page.slide ? 'Folie' : 'Seite'} ${i + 1}${page.slide ? ` „${page.blocks.find((b) => b.title)?.title ?? ''}“` : ''}`, text: [...page.blocks.map(extractedText), ...(page.diagram?.boxes.map((b) => b.label) ?? []), ...(page.diagram?.captions.map((c) => c.text) ?? [])].join('\n') })
    if (extracted?.blocks) for (const b of extracted.blocks) {
      if (b.h1 || b.h2 || !units.length) units.push({ section: b.h2 ?? b.h1 ?? f.name, text: '' })
      else units.at(-1).text += `${extractedText(b)}\n`
    }
    return { ...sharepoint(f.id), labels: [extracted?.docType ?? 'unbekannt'], units, unreadable: !extracted }
  })
  return [...pages, ...files]
}

/* ---------- Where each neuraldoc document lives (Confluence or SharePoint) ---------- */

const confluence = (id) => {
  const p = db.pages.find((x) => x.id === id)
  return { system: 'Confluence', id, title: p.title, url: `${SITE}/wiki${p._links.webui}`, version: p.version.number }
}
const sharepoint = (id) => {
  const f = db.files.find((x) => x.id === id)
  return { system: 'SharePoint', id, title: f.name, url: f.webUrl, version: Number(f['@odata.etag'].match(/,(\d+)/)?.[1] ?? 1) }
}
const newPage = (parentId, title) => ({ ...confluence(parentId), id: `${parentId}/neu`, title, version: 0, parent: confluence(parentId).title })

const TARGETS = {
  'nh-kaufvertrag': () => confluence('393281611'),
  'nh-tour': () => confluence('393282017'),
  'nh-fibu': () => confluence('393282611'),
  'nh-kasse': () => confluence('393282305'),
  'dlg-kaufvertrag': () => sharepoint('01MOBIQ004748DOC20'),
  'dlg-fahrzeug': () => newPage('426115109', 'Fahrzeugstamm'),
  'par-auftrag': () => sharepoint('01MOBIQ004711DOC14'),
  'td-fibu': () => confluence('458752069'),
  'td-datenmodell': () => confluence('458752101'),
  'td-kasse': () => confluence('458752165'),
  'inst-update': () => confluence('491520033'),
  'arch-gesamt': () => confluence('458752033'),
}

/** The page or file a neuraldoc document is written back to. */
export const targetOf = (docId) => TARGETS[docId]?.() ?? null

/* ---------- Search (BM25) ---------- */

const STOP = new Set(
  'der die das und oder ein eine einer eines einem einen ist sind wird werden wurde im in am an auf aus bei mit nach von vor zu zum zur für über unter nicht nur auch wie was wer wo wann warum welche welcher welches den dem des als sich es sie er wir ihr ich du so dann wenn ob da kann können muss soll gibt jetzt noch prüfen prüft geprüft bitte ab the a of to and'.split(' '),
)
const stem = (w) => w.replace(/(ungen|ung|en|er|es|e|n|s)$/u, '')
export const tokens = (s) =>
  (s.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [])
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.length > 4 ? stem(w) : w))

/** A BM25 index over `items`; `textOf` gives each item's searchable text. */
export function bm25(items, textOf) {
  const tf = items.map((it) => {
    const m = new Map()
    for (const t of tokens(textOf(it))) m.set(t, (m.get(t) ?? 0) + 1)
    return m
  })
  const lens = tf.map((m) => [...m.values()].reduce((a, b) => a + b, 0))
  const avg = lens.reduce((a, b) => a + b, 0) / Math.max(1, items.length)
  const df = new Map()
  for (const m of tf) for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1)
  const N = items.length
  return (query, limit = 5) => {
    const q = [...new Set(tokens(query))]
    return items
      .map((item, i) => {
        let score = 0
        for (const t of q) {
          const f = tf[i].get(t)
          if (!f) continue
          const idf = Math.log(1 + (N - df.get(t) + 0.5) / (df.get(t) + 0.5))
          score += idf * ((f * 2.4) / (f + 1.4 * (0.25 + (0.75 * lens[i]) / avg)))
        }
        return { item, score }
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }
}

export const sourcesInfo = () => [
  { id: 'gitlab', name: 'GitLab', target: 'mobiq/erp', items: `${db.commits.length} Commits, ${db.mrs.length} Merge-Requests` },
  { id: 'jira', name: 'Jira', target: 'Projekt MOB', items: `${db.issues.length} Tickets` },
  { id: 'confluence', name: 'Confluence', target: '4 Bereiche', items: `${db.pages.length} Seiten` },
  { id: 'sharepoint', name: 'SharePoint', target: 'Produktdokumentation', items: `${db.files.length} Dateien` },
]
