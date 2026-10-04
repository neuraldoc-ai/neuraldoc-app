// One data contract for the showcase and imported projects. The UI imports only
// this module; the prepared examples stay in their own fixture module.
import * as showcase from './showcase-data.ts'
export * from './showcase-data.ts'

export type ProjectDataset = Pick<typeof showcase, 'company' | 'currentUser' | 'release' | 'modules' | 'people' | 'docs' | 'bundles' | 'proposals' | 'backtest'>
export let datasetMode: 'showcase' | 'working' = 'showcase'
export let company = showcase.company
export let currentUser = showcase.currentUser
export let release = showcase.release
export let modules = showcase.modules
export let people = showcase.people
export let docs = showcase.docs
export let bundles = showcase.bundles
export let proposals = showcase.proposals
export let backtest = showcase.backtest
export let docTypes = showcase.docTypes

export function installDataset(dataset: ProjectDataset | null) {
  datasetMode = dataset ? 'working' : 'showcase'
  const source = dataset || showcase
  company = source.company
  currentUser = source.currentUser
  release = source.release
  modules = source.modules
  people = source.people
  docs = source.docs
  bundles = source.bundles
  proposals = source.proposals
  backtest = source.backtest
  docTypes = dataset ? Object.fromEntries(Object.entries(showcase.docTypes).map(([id, type]) => [id, { ...type, audience: 'Leser der importierten Dokumentation' }])) as typeof showcase.docTypes : showcase.docTypes
}
