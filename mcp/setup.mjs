import { draftingStatus } from './drafting.mjs'
import { runtimeEnv } from './settings.mjs'
export function setupStatus(env = runtimeEnv()) {
  return {
    drafting: draftingStatus(env),
    jev: { provider: 'typesafe', required: true, configured: !!(env.TYPESAFE_API_KEY || env.JEV_API_KEY)?.trim(), model: 'jev-1.13.0' },
    credentials: {
      openai: !!env.OPENAI_API_KEY?.trim(), anthropic: !!env.ANTHROPIC_API_KEY?.trim(),
      gemini: !!(env.GEMINI_API_KEY || env.GOOGLE_API_KEY)?.trim(), vertex: !!env.VERTEX_API_KEY?.trim(),
    },
    verification: 'configuration-only',
  }
}
