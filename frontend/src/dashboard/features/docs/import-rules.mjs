// Which uploaded files neuraldoc reads. Shared by the browser (filters before upload) and the server.

export const LIMITS = { codeFiles: 1500, codeBytes: 100_000, fileBytes: 30_000_000, sections: 400, sectionChars: 6000, uploadBytes: 200_000_000 }

const IGNORED_DIR = /(^|\/)(\.git|\.svn|\.hg|node_modules|bower_components|vendor|dist|build|out|target|bin|obj|coverage|\.next|\.nuxt|\.svelte-kit|\.venv|venv|__pycache__|\.pytest_cache|\.idea|\.vscode|\.gradle|\.terraform|\.cache)(\/|$)/i
// Example environment files (.env.example, .env.sample …) document configuration and hold no secrets.
const SECRET = /(^|\/)(\.env(?!\.(example|sample|template|dist|defaults)$)[^/]*|[^/]*(secret|credential|private.?key)[^/]*|id_rsa|id_ed25519|\.npmrc|\.pypirc)$|\.(pem|key|p12|pfx|jks|keystore)$/i
const GENERATED = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|poetry\.lock|Cargo\.lock|Gemfile\.lock|go\.sum|uv\.lock)$|\.min\.(js|css)$|\.map$/i
const CODE = /\.(java|kt|kts|ts|tsx|js|jsx|mjs|cjs|py|go|rs|cs|pas|dpr|sql|rb|php|swift|scala|c|cc|cpp|h|hpp|vue|svelte|yaml|yml|json|xml|properties|toml|ini|gradle|sh|bash|ps1|bat|cmd|tf|graphql|gql|proto|prisma|cfg|conf)$|(^|\/)(Makefile|Dockerfile|Containerfile|Procfile|Justfile|\.env\.(example|sample|template|dist|defaults))$|(^|\/)Dockerfile\.[\w.-]+$/i
export const DOC = /\.(md|mdx|markdown|txt|rst|adoc|asciidoc|html?|pdf|docx|xlsx|pptx|csv)$/i
// Repository files that are not product documentation: legal texts, histories, templates.
const NOT_DOCS = /(^|\/)(license|licence|copying|notice|changelog|changes|history|release[-_ ]?notes|code[-_]of[-_]conduct|authors|contributors|security|pull_request_template|issue_template)(\.[a-z]+)?$|(^|\/)\.github\//i
const TESTS = /(^|\/)(test|tests|__tests__|spec|fixtures?|testdata|__snapshots__)\//i
const DOC_DIR = /(^|\/)(docs?|documentation|dokumentation|handbuch|manuals?|wiki|guides?|anleitungen?)\//i

/** Folders and files that are never read: dependencies, build output, secrets. */
export const ignored = (path) => IGNORED_DIR.test(path) || SECRET.test(path)

/** 'code', 'doc' or null for a path inside the repository ('repo') or the documentation upload ('docs'). */
export function classify(path, role) {
  if (IGNORED_DIR.test(path) || SECRET.test(path) || GENERATED.test(path)) return null
  // Documentation uploads may also be Confluence pages in storage format (.xml).
  if (role === 'docs') return DOC.test(path) || /\.xml$/i.test(path) ? 'doc' : null
  const name = path.split('/').pop()
  if (!NOT_DOCS.test(path) && !TESTS.test(path)) {
    if (/^readme(\.[a-z]+)?$/i.test(name) && (!name.includes('.') || DOC.test(name))) return 'doc'
    if (DOC_DIR.test(path) && DOC.test(name)) return 'doc'
    if (/\.(md|mdx|markdown|rst|adoc|asciidoc|pdf|docx|xlsx|pptx)$/i.test(name)) return 'doc'
  }
  return CODE.test(name) ? 'code' : null
}

/**
 * The rules of the .gitignore files of an uploaded folder as one test: `ignore(path)` is true for paths Git would not
 * track (generated folders, local state, caches). `files` maps the folder of each .gitignore ('' = root) to its text.
 * Supports comments, negation (!), anchored (/a, a/b) and directory (a/) patterns and the globs *, ? and **.
 */
export function gitignore(files) {
  const rules = []
  for (const [base, text] of Object.entries(files)) {
    for (const raw of text.split(/\r?\n/)) {
      let line = raw.replace(/(?<!\\)\s+$/, '')
      if (!line || line.startsWith('#')) continue
      const negate = line.startsWith('!')
      if (negate) line = line.slice(1)
      const dir = line.endsWith('/')
      line = line.replace(/\/+$/, '')
      const anchored = line.includes('/')
      line = line.replace(/^\//, '')
      // "a/**/b" also matches "a/b".
      const glob = line.split(/(\/\*\*\/|\*\*\/|\/\*\*|\*\*|\*|\?)/).map((part) => ({ '/**/': '/(?:.*/)?', '**/': '(?:.*/)?', '/**': '/.*', '**': '.*', '*': '[^/]*', '?': '[^/]' })[part] ?? part.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('')
      const prefix = base ? `${base.replace(/[.+^${}()|[\]\\]/g, '\\$&')}/` : ''
      // A pattern without a slash matches at any depth below its .gitignore; a matched directory takes everything in it.
      rules.push({ negate, test: new RegExp(`^${prefix}${anchored ? '' : '(?:.*/)?'}${glob}${dir ? '/' : '(?:/|$)'}`) })
    }
  }
  return (path) => rules.reduce((ignoredSoFar, rule) => (rule.test.test(path) ? !rule.negate : ignoredSoFar), false)
}

/** The display name of a GitHub (or other https Git) URL, or null if it is not one. */
export function repoUrl(value) {
  const text = String(value || '').trim().replace(/\/+$/, '').replace(/\.git$/, '')
  const full = /^https?:\/\//i.test(text) ? text : /^(github\.com|gitlab\.com|bitbucket\.org)\//i.test(text) ? `https://${text}` : ''
  const match = full.match(/^https:\/\/[a-z0-9.-]+(:\d+)?\/([\w.-]+\/)+[\w.-]+$/i)
  return match ? { url: `${full}.git`, name: full.split('/').pop() } : null
}
