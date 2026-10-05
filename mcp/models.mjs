// Which models a provider offers, for the dropdown in the settings. Only lists models: no model call, no cost.
// With a key the list comes from the provider itself; without one (or offline) a short built-in list is shown.
import { compatibleBase } from './llm-providers.mjs'
import { GOOGLE_MODELS } from './drafting.mjs'
import { runtimeEnv } from './settings.mjs'

const BUILT_IN = {
  openai: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini'],
  anthropic: ['claude-haiku-4-5', 'claude-sonnet-5-5', 'claude-opus-5-5'],
  local: [],
}
// OpenAI lists every model of the account; drafts need a text chat model.
const OPENAI_CHAT = /^(gpt-|o\d|chatgpt-)/i
const OPENAI_OTHER = /(audio|realtime|tts|transcribe|whisper|image|dall-e|embedding|moderation|search|instruct)/i

const entries = (ids) => [...new Set(ids)].map((id) => ({ id, label: id }))

export async function listModels(provider, { baseUrl, fetchImpl = fetch } = {}) {
  if (provider === 'gemini' || provider === 'vertex') return { models: entries(GOOGLE_MODELS), source: 'neuraldoc' }
  if (!Object.hasOwn(BUILT_IN, provider)) throw new Error('Unbekannter Anbieter.')
  const env = runtimeEnv()
  const builtIn = (error) => ({ models: entries(BUILT_IN[provider]), source: 'built-in', ...(error ? { error } : {}) })
  const get = async (url, headers) => {
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  }
  try {
    if (provider === 'openai') {
      const key = env.OPENAI_API_KEY?.trim()
      if (!key) return builtIn()
      const body = await get('https://api.openai.com/v1/models', { Authorization: `Bearer ${key}` })
      return { models: entries(body.data.map((m) => m.id).filter((id) => OPENAI_CHAT.test(id) && !OPENAI_OTHER.test(id)).sort()), source: 'provider' }
    }
    if (provider === 'anthropic') {
      const key = env.ANTHROPIC_API_KEY?.trim()
      if (!key) return builtIn()
      const body = await get('https://api.anthropic.com/v1/models?limit=100', { 'x-api-key': key, 'anthropic-version': '2023-06-01' })
      return { models: body.data.map((m) => ({ id: m.id, label: m.display_name || m.id })), source: 'provider' }
    }
    // Ollama, LM Studio and vLLM all answer GET /v1/models in the OpenAI format.
    const base = compatibleBase(baseUrl || env.NEURALDOC_LLM_BASE_URL || 'http://127.0.0.1:11434/v1')
    const key = env.NEURALDOC_LLM_API_KEY?.trim()
    const body = await get(`${base}/models`, key ? { Authorization: `Bearer ${key}` } : {})
    return { models: entries(body.data.map((m) => m.id).sort()), source: 'provider' }
  } catch (error) {
    return builtIn(provider === 'local' ? `Modellserver nicht erreichbar (${error.message}).` : `Liste nicht abrufbar (${error.message}).`)
  }
}
