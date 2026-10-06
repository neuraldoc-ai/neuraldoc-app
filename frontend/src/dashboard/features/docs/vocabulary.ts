/**
 * The words neuraldoc uses for documentation, changes and proposals. Shared by own projects and
 * the MOBIQ showcase; contains no sample data.
 */

/* ---------- Kinds of documentation and who reads them ---------- */

export type DocTypeId = 'nutzer' | 'dialog' | 'parameter' | 'technik' | 'installation' | 'architektur'

/** What a change touches. A doc type is only checked when it reacts to one of these. */
export type ChangeKind = 'prozess' | 'feld' | 'label' | 'parameter' | 'schnittstelle' | 'datenbank' | 'betrieb' | 'intern'

export const changeKinds: Record<ChangeKind, { label: string; nature: Nature }> = {
  prozess: { label: 'Prozessschritt', nature: 'fachlich' },
  feld: { label: 'Feld oder Dialog', nature: 'fachlich' },
  label: { label: 'Umbenennung', nature: 'umbenennung' },
  parameter: { label: 'Parameter', nature: 'technisch' },
  schnittstelle: { label: 'Schnittstelle', nature: 'technisch' },
  datenbank: { label: 'Datenbank', nature: 'technisch' },
  betrieb: { label: 'Installation und Update', nature: 'technisch' },
  intern: { label: 'Intern (Umbau, Tests)', nature: 'intern' },
}

export type Nature = 'fachlich' | 'technisch' | 'umbenennung' | 'intern'

export const natures: Record<Nature, string> = {
  fachlich: 'Fachlich',
  technisch: 'Technisch',
  umbenennung: 'Umbenennung',
  intern: 'Intern',
}

export const docTypes: Record<DocTypeId, { label: string; plural: string; audience: string; reactsTo: ChangeKind[]; voice?: string }> = {
  nutzer: {
    label: 'Nutzerhandbuch',
    plural: 'Nutzerhandbücher',
    audience: 'Anwenderinnen und Anwender',
    reactsTo: ['prozess', 'feld', 'label'],
  },
  dialog: {
    label: 'Dialogbeschreibung',
    plural: 'Dialogbeschreibungen',
    audience: 'Support und Schulung',
    reactsTo: ['feld', 'label'],
  },
  parameter: {
    label: 'Parametertabelle',
    plural: 'Parametertabellen',
    audience: 'Einrichtung und Support',
    reactsTo: ['parameter'],
  },
  technik: {
    label: 'Technische Doku',
    plural: 'Technische Dokus',
    audience: 'Entwicklung und Partner',
    reactsTo: ['schnittstelle', 'datenbank'],
  },
  installation: {
    label: 'Installationsdoku',
    plural: 'Installationsdokus',
    audience: 'Administration und Betrieb',
    reactsTo: ['betrieb'],
  },
  architektur: {
    label: 'Architekturbild',
    plural: 'Architekturbilder',
    audience: 'Architektur und Entwicklung',
    reactsTo: ['schnittstelle'],
  },
}

export const docTypeOrder: DocTypeId[] = ['nutzer', 'dialog', 'parameter', 'technik', 'installation', 'architektur']

/* ---------- Product modules and people ---------- */

export type ModuleId = string

export type PersonId = string

/* ---------- Documents ---------- */

export type Block =
  | { kind: 'h'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'figure'; caption: string }

export type Doc = {
  id: string
  title: string
  /** Own projects: where the document lives (repository/README.md, dokumentation/handbuch.pdf). */
  path?: string
  type: DocTypeId
  modules: ModuleId[]
  owner: PersonId
  version: string
  updated: string
  pages: number
  /** Not written yet — neuraldoc proposes the first version. */
  planned?: boolean
  blocks: Block[]
}

/* ---------- Commits and the changes they form ---------- */

export type CommitKind = ChangeKind | 'fix' | 'test'

export const commitKinds: Record<CommitKind, string> = {
  ...Object.fromEntries(Object.entries(changeKinds).map(([k, v]) => [k, v.label])),
  fix: 'Fehlerbehebung',
  test: 'Tests',
} as Record<CommitKind, string>

export type Commit = {
  hash: string
  date: string
  author: string
  message: string
  kind: CommitKind
  files: string[]
  /** A later commit in the same change replaced this intermediate state. */
  supersededBy?: string
  note?: string
}

/** What a change of an own project means for readers, from its commits and diff (mcp/feature-texts.mjs). */
export type ChangeType = 'neu' | 'geaendert' | 'fix' | 'intern'

export const changeTypes: Record<ChangeType, { label: string; hint: string; nature: Nature }> = {
  neu: { label: 'Neue Funktion', hint: 'Man kann etwas Neues tun', nature: 'fachlich' },
  geaendert: { label: 'Geändertes Verhalten', hint: 'Etwas funktioniert anders', nature: 'fachlich' },
  fix: { label: 'Fehlerbehebung', hint: 'Ein Fehler ist behoben', nature: 'technisch' },
  intern: { label: 'Intern', hint: 'Tests, Umbau, Build', nature: 'intern' },
}

export type Step = { text: string; mark?: 'neu' | 'geändert' }

export type Aspect = { kind: ChangeKind; module: ModuleId; text: string; commits: string[] }

export type Bundle = {
  id: string
  title: string
  ticket: string
  epic?: string
  mr: string
  merged: string
  /** Where this change sits in the product, read from the existing documentation. */
  path: string[]
  alsoAffects?: string[]
  classifiedVia: string[]
  summary: string
  before?: Step[]
  after?: Step[]
  aspects: Aspect[]
  commits: Commit[]
  /** Nothing visible changes for readers — shown so it is clear the change was checked. */
  noDocsReason?: string
  /* Own projects with Git history: the change in plain words and the commit it came from. */
  /** The original commit or merge request subject. */
  subject?: string
  type?: ChangeType
  /** Parts of the product it touches, in a user's words. */
  areas?: string[]
  /** true when the model described it, false when the title is the cleaned commit subject. */
  described?: boolean
  stats?: { files: number; additions: number; deletions: number }
  authors?: string[]
}

/* ---------- Proposals ---------- */

export type Size = 'satz' | 'absatz' | 'kapitel' | 'seite' | 'tabelle' | 'bild'

export const sizes: Record<Size, string> = {
  satz: 'Satz',
  absatz: 'Absatz',
  kapitel: 'Neues Kapitel',
  seite: 'Neue Seite',
  tabelle: 'Tabellenzeilen',
  bild: 'Bild',
}

export type Confidence = 'hoch' | 'mittel' | 'pruefen'

export const confidences: Record<Confidence, string> = { hoch: 'Sicher', mittel: 'Wahrscheinlich', pruefen: 'Kurz prüfen' }

/**
 * One proposed edit. `at` is the block it refers to (-1 = start of the document).
 * replace: swap `find` for `text` inside that block (in a table: in every cell).
 * insert:  new blocks after it. rows: new rows at the end of that table.
 * note:    a task for a person (e.g. redraw a picture), optionally with text to insert.
 */
export type Proposal = {
  id: string
  bundle: string
  doc: string
  at: number
  op: 'replace' | 'insert' | 'rows' | 'note'
  find?: string
  text?: string
  blocks?: Block[]
  rows?: string[][]
  size: Size
  title: string
  why: string
  confidence: Confidence
  commits: string[]
  /** A question to a person, when the code alone does not answer it. */
  question?: string
  /** What a person still has to do by hand. */
  task?: string
}

export type Sensitivity = 'streng' | 'ausgewogen' | 'gruendlich'
