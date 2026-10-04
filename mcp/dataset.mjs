// The MOBIQ example lives in four Git submodules under datasets/: mobiq (generator, GitLab/Jira data,
// ground truth), mobiq-code, mobiq-docs and mobiq-db. Code and the graph keep the original dataset
// layout ("repo/…", "gitlab/…", "postgres/…"); dataPath maps such a path to the repository holding it.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DATASETS = fileURLToPath(new URL('../datasets/', import.meta.url))
const homes = { repo: 'mobiq-code', confluence: 'mobiq-docs/confluence', dokumente: 'mobiq-docs/dokumente', postgres: 'mobiq-db' }

export function dataPath(rel = '') {
  const [head, ...rest] = rel.replaceAll('\\', '/').split('/')
  return Object.hasOwn(homes, head) ? path.join(DATASETS, homes[head], ...rest) : path.join(DATASETS, 'mobiq/data', rel)
}

/** Inverse of dataPath for files inside the dataset: the layout-relative path stored as evidence. */
export function datasetRelative(abs) {
  for (const [head, home] of Object.entries(homes)) {
    const rel = path.relative(path.join(DATASETS, home), abs)
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) return [head, rel].filter(Boolean).join('/').replaceAll('\\', '/')
  }
  return path.relative(path.join(DATASETS, 'mobiq/data'), abs).replaceAll('\\', '/')
}
