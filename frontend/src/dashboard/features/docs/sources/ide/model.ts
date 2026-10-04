/** Pure helpers for the GitLab IDE: languages, file tree, search and unified-diff parsing. */

const LANGUAGES: Record<string, { id: string; label: string }> = {
  java: { id: 'java', label: 'Java' },
  kt: { id: 'kotlin', label: 'Kotlin' },
  pas: { id: 'pascal', label: 'Delphi / Pascal' },
  ts: { id: 'typescript', label: 'TypeScript' },
  tsx: { id: 'typescript', label: 'TypeScript React' },
  json: { id: 'json', label: 'JSON' },
  yaml: { id: 'yaml', label: 'YAML' },
  yml: { id: 'yaml', label: 'YAML' },
  sql: { id: 'sql', label: 'SQL' },
  xml: { id: 'xml', label: 'XML' },
  jmx: { id: 'xml', label: 'JMeter (XML)' },
  html: { id: 'html', label: 'HTML' },
  md: { id: 'markdown', label: 'Markdown' },
  rc: { id: 'cpp', label: 'Resource-Skript' },
  csv: { id: 'plaintext', label: 'CSV' },
}

export function languageOf(path: string) {
  const ext = path.includes('.') ? path.split('.').pop()!.toLowerCase() : ''
  return LANGUAGES[ext] ?? { id: 'plaintext', label: 'Text' }
}

/* ---------- File tree ---------- */

export type TreeNode = { name: string; path: string; children: TreeNode[]; file: boolean }

/** Folder tree; chains of single folders are shown in one line, like GitLab and VS Code do. */
export function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: '', path: '', children: [], file: false }
  for (const p of paths) {
    let cur = root
    p.split('/').forEach((part, i, all) => {
      let next = cur.children.find((c) => c.name === part)
      if (!next) {
        next = { name: part, path: all.slice(0, i + 1).join('/'), children: [], file: i === all.length - 1 }
        cur.children.push(next)
      }
      cur = next
    })
  }
  const compact = (n: TreeNode): TreeNode => {
    let node = n
    while (!node.file && node.children.length === 1 && !node.children[0].file && node !== root) {
      const only = node.children[0]
      node = { ...only, name: `${node.name}/${only.name}` }
    }
    const children = node.children.map(compact).sort((a, b) => Number(a.file) - Number(b.file) || a.name.localeCompare(b.name))
    return { ...node, children }
  }
  return compact(root)
}

/* ---------- Search ---------- */

export type SearchHit = { path: string; matches: { line: number; text: string; from: number }[] }

export function searchFiles(files: Record<string, { content: string }>, query: string, limit = 300): { hits: SearchHit[]; total: number } {
  const q = query.toLowerCase()
  const hits: SearchHit[] = []
  let total = 0
  if (!q) return { hits, total }
  for (const [path, { content }] of Object.entries(files)) {
    const matches: SearchHit['matches'] = []
    content.split('\n').forEach((text, i) => {
      const from = text.toLowerCase().indexOf(q)
      if (from >= 0) {
        total++
        if (total <= limit) matches.push({ line: i + 1, text, from })
      }
    })
    if (matches.length) hits.push({ path, matches })
  }
  return { hits, total }
}

/* ---------- Unified diff -> two sides ---------- */

export type DiffSides = {
  original: string
  modified: string
  /** real line numbers in the old/new file for every displayed line ('' for hunk separators) */
  originalNumbers: string[]
  modifiedNumbers: string[]
  added: number
  removed: number
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/**
 * GitLab only delivers the changed hunks, not the whole files. Both sides are rebuilt from the hunks (context + removed
 * lines on the left, context + added lines on the right); hunks are joined by an identical separator line so the diff
 * editor folds everything in between, and line numbers are mapped back to the real ones.
 */
export function parseDiff(diff: string): DiffSides {
  const original: string[] = []
  const modified: string[] = []
  const originalNumbers: string[] = []
  const modifiedNumbers: string[] = []
  let added = 0
  let removed = 0
  let oldNo = 0
  let newNo = 0
  let seenHunk = false
  const separator = () => {
    if (!seenHunk) return
    for (const [side, nums] of [[original, originalNumbers], [modified, modifiedNumbers]] as const) {
      side.push('⋯')
      nums.push('')
    }
  }
  for (const line of diff.replace(/\n$/, '').split('\n')) {
    const h = HUNK.exec(line)
    if (h) {
      separator()
      seenHunk = true
      oldNo = Number(h[1])
      newNo = Number(h[2])
    } else if (!seenHunk || line.startsWith('\\')) {
      continue
    } else if (line.startsWith('+')) {
      modified.push(line.slice(1))
      modifiedNumbers.push(String(newNo++))
      added++
    } else if (line.startsWith('-')) {
      original.push(line.slice(1))
      originalNumbers.push(String(oldNo++))
      removed++
    } else {
      const text = line.startsWith(' ') ? line.slice(1) : line
      original.push(text)
      modified.push(text)
      originalNumbers.push(String(oldNo++))
      modifiedNumbers.push(String(newNo++))
    }
  }
  return { original: original.join('\n'), modified: modified.join('\n'), originalNumbers, modifiedNumbers, added, removed }
}
