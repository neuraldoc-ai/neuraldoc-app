// One data contract for imported projects and the MOBIQ showcase. The UI imports only this module.
// It starts empty; the showcase fixtures (showcase-data.ts) are a separate chunk loaded only in showcase mode.
import type * as Showcase from './showcase-data.ts'
import { docTypes as baseDocTypes } from './vocabulary.ts'
export * from './vocabulary.ts'

export type ProjectDataset = Pick<typeof Showcase, 'company' | 'currentUser' | 'release' | 'modules' | 'people' | 'docs' | 'bundles' | 'proposals' | 'backtest'>
type Fixtures = ProjectDataset & Pick<typeof Showcase, 'sensitivities' | 'missed' | 'falseAlarmReasons' | 'filtered' | 'mcpInputs'> & { TODAY: string }

/** showcase: prepared MOBIQ example · working: an imported project · empty: nothing imported yet. */
export let datasetMode: 'showcase' | 'working' | 'empty' = 'empty'
const noSensitivity = { label: '', found: 0, falseAlarms: 0, text: '' }
const noInput = { key: '', label: '', placeholder: '', examples: [] }
const empty: Fixtures = {
  TODAY: new Date().toISOString().slice(0, 10),
  company: { name: '', short: '', product: 'neuraldoc', claim: '' },
  currentUser: { name: '', role: '', initials: '' },
  release: { id: '', freeze: '', ship: '' },
  modules: {}, people: {}, docs: [], bundles: [], proposals: [], backtest: [],
  sensitivities: { streng: noSensitivity, ausgewogen: noSensitivity, gruendlich: noSensitivity },
  missed: [], falseAlarmReasons: [], filtered: { perCommit: 0, withoutAudience: 0 },
  mcpInputs: { check_change: noInput, ask: noInput, ticket_context: noInput },
}
// Outside the showcase the readers are whoever reads the imported documentation.
const neutralDocTypes = Object.fromEntries(Object.entries(baseDocTypes).map(([id, type]) => [id, { ...type, audience: 'Leser der importierten Dokumentation' }])) as typeof baseDocTypes

export let TODAY = empty.TODAY
export let company = empty.company
export let currentUser = empty.currentUser
export let release = empty.release
export let modules = empty.modules
export let people = empty.people
export let docs = empty.docs
export let bundles = empty.bundles
export let proposals = empty.proposals
export let backtest = empty.backtest
export let sensitivities = empty.sensitivities
export let missed = empty.missed
export let falseAlarmReasons = empty.falseAlarmReasons
export let filtered = empty.filtered
export let mcpInputs = empty.mcpInputs
export let docTypes = neutralDocTypes

function install(source: Fixtures) {
  ;({ TODAY, company, currentUser, release, modules, people, docs, bundles, proposals, backtest, sensitivities, missed, falseAlarmReasons, filtered, mcpInputs } = source)
}

/** An imported project, or null for the empty start. */
export function installDataset(dataset: ProjectDataset | null) {
  datasetMode = dataset ? 'working' : 'empty'
  install(dataset ? { ...empty, ...dataset } : empty)
  docTypes = neutralDocTypes
}

/** The prepared MOBIQ example; only the showcase build serves it. */
export async function installShowcase() {
  const showcase = await import('./showcase-data.ts')
  datasetMode = 'showcase'
  install(showcase)
  docTypes = Object.fromEntries(Object.entries(baseDocTypes).map(([id, type]) => [id, { ...type, ...showcase.docTypeReaders[id as keyof typeof baseDocTypes] }])) as typeof baseDocTypes
}
