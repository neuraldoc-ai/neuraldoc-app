// The optional decision model: a second opinion on the check's findings. It answers typed questions with probabilities
// over one wire protocol (POST …/v1/systemone), confirms or refutes a finding, and must confirm a deletion. Without it the
// check still runs on the LLM and its own second look; findings are then marked "prüfen" and nothing is dropped.
//   jev        TypeSafe Jev, hosted in the US; TYPESAFE_API_KEY
//   microsoft  Microsoft-Decision-1 in Azure Foundry; NEURALDOC_DECISION_URL (resource endpoint), NEURALDOC_DECISION_MODEL
//              (deployment name), NEURALDOC_DECISION_API_KEY. A DataZoneStandard deployment keeps it in the EU data zone.
//   laya       Laya (Apache 2.0) on your own server (laya-serve); NEURALDOC_DECISION_URL, optional NEURALDOC_DECISION_API_KEY
import { MODEL as JEV_MODEL, INPUT_USD_PER_MILLION } from './semantic-mapping.mjs'
import { runtimeEnv } from './settings.mjs'

export const DECISION_PROVIDERS = {
  jev: { label: 'Jev', where: 'Cloud von TypeSafe, USA' },
  microsoft: { label: 'Microsoft-Decision-1', where: 'eure Azure-Foundry-Ressource' },
  laya: { label: 'Laya', where: 'euer eigener Server' },
}

/** Which decision model the check uses, and how to reach it; `client` holds the options for createJevClient. */
export function decisionConfig(env = runtimeEnv()) {
  const jevKey = (env.TYPESAFE_API_KEY || env.JEV_API_KEY)?.trim()
  // Installations that only had a Jev key keep using it; everyone else starts without a decision model.
  const provider = env.NEURALDOC_DECISION_PROVIDER?.trim() || (jevKey ? 'jev' : 'off')
  const known = DECISION_PROVIDERS[provider]
  if (!known) return { provider: 'off', label: 'Aus', configured: false, error: null }
  const base = String(env.NEURALDOC_DECISION_URL || '').trim().replace(/\/+$/, ''), key = env.NEURALDOC_DECISION_API_KEY?.trim()
  const endpoint = (suffix) => /\/v1\/systemone$/.test(base) ? base : base + suffix
  const result = (configured, error, client) => ({ provider, label: known.label, where: known.where, configured, error: configured ? null : error, ...(configured ? { client: { ...client, label: known.label } } : {}) })
  if (provider === 'jev') return result(!!jevKey, 'Der Jev-Key fehlt.', { key: jevKey, model: JEV_MODEL, price: INPUT_USD_PER_MILLION })
  if (provider === 'microsoft') {
    const model = env.NEURALDOC_DECISION_MODEL?.trim()
    return result(/^https:\/\/[\w.-]+/.test(base) && !!model && !!key, 'Für Microsoft-Decision-1 fehlen Foundry-Adresse, Bereitstellungsname oder API-Key.',
      { url: endpoint('/providers/microsoft/v1/systemone'), model, headers: { 'api-key': key }, strict: false, price: INPUT_USD_PER_MILLION })
  }
  // Laya: the multilingual checkpoint reads German; a self-hosted model costs nothing per call.
  return result(/^https?:\/\/[\w.-]+/.test(base), 'Für Laya fehlt die Adresse des Servers (z. B. http://laya:8000).',
    { url: endpoint('/v1/systemone'), model: env.NEURALDOC_DECISION_MODEL?.trim() || 'multilingual', headers: key ? { Authorization: `Bearer ${key}` } : {}, strict: false, price: 0 })
}

/** For the setup status: what is chosen and whether it is complete; never the key. */
export function decisionStatus(env = runtimeEnv()) {
  const { provider, label, where, configured, error } = decisionConfig(env)
  return { provider, label, where: where ?? null, configured, optional: true, error }
}
