import { draftingStatus } from './drafting.mjs'
import { decisionStatus } from './decision.mjs'
import { runtimeEnv } from './settings.mjs'
export function setupStatus(env = runtimeEnv()) {
  return {
    drafting: draftingStatus(env),
    // Optional second opinion on findings: Jev, Microsoft-Decision-1, Laya or none (decision.mjs).
    decision: decisionStatus(env),
    credentials: {
      openai: !!env.OPENAI_API_KEY?.trim(), anthropic: !!env.ANTHROPIC_API_KEY?.trim(),
      gemini: !!(env.GEMINI_API_KEY || env.GOOGLE_API_KEY)?.trim(), vertex: !!env.VERTEX_API_KEY?.trim(),
    },
    verification: 'configuration-only',
  }
}
