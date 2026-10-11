// Repositories of the code-brain lab. "dev" repositories may be looked at while building the mapping; "test" ones are
// only scored, so that the numbers say how the mapping does on a codebase it was not tuned on.
// ref: the snapshot the mapping sees. Ground truth comes from the maintainers' own commits before it (mine.mjs).
export const REPOS = [
  { name: 'ky', ref: 'v2.1.0', lang: 'TypeScript', arch: 'library, README only', split: 'dev' },
  { name: 'zx', ref: '8.5.0', lang: 'TypeScript', arch: 'CLI, docs folder', split: 'dev' },
  { name: 'httpx', ref: '0.28.1', lang: 'Python', arch: 'library, mkdocs', split: 'dev' },
  { name: 'cobra', ref: 'v1.10.1', lang: 'Go', arch: 'library, site', split: 'dev' },
  { name: 'linkding', ref: 'v1.47.0', lang: 'Python, TS', arch: 'Django web app', split: 'dev' },
  { name: 'graphhopper', ref: '11.1', lang: 'Java', arch: 'multi-module Maven, routing engine and web service', split: 'dev' },
  { name: 'textual', ref: 'v8.2.8', lang: 'Python', arch: 'framework, mkdocs', split: 'dev' },
  { name: 'detekt', ref: 'v2.0.0-alpha.6', lang: 'Kotlin', arch: 'multi-module Gradle, rule sets, docs site', split: 'dev' },
  { name: 'immich', ref: 'v3.3.1', lang: 'TypeScript, Dart, Python', arch: 'monorepo: server, web, mobile, ML service', split: 'dev' },
  { name: 'okhttp', ref: 'parent-5.5.0', lang: 'Kotlin, Java', arch: 'multi-module Gradle', split: 'test' },
  { name: 'fiber', ref: 'v3.5.0', lang: 'Go', arch: 'framework with middleware packages', split: 'test' },
  { name: 'trpc', ref: 'v11.21.0', lang: 'TypeScript', arch: 'pnpm monorepo, docs site', split: 'test' },
  { name: 'testcontainers-java', ref: '2.0.5', lang: 'Java', arch: 'multi-module, one module per technology', split: 'test' },
  { name: 'flask', ref: '3.1.3', lang: 'Python', arch: 'framework, reStructuredText docs', split: 'test' },
  { name: 'spring-modulith', ref: '2.2.0-M2', lang: 'Java', arch: 'modular monolith toolkit, AsciiDoc', split: 'test' },
]
