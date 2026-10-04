import { draftingStatus } from './drafting.mjs'
export function setupStatus(env = process.env) {
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
