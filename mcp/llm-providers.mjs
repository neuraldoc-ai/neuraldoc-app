// Provider-specific wire formats. All output still passes the common draft validator.
export const PROVIDER_LABELS = { vertex: 'Gemini · Vertex AI', gemini: 'Gemini', openai: 'OpenAI', anthropic: 'Claude', local: 'Lokales LLM' }
export const DEFAULT_MODELS = { openai: 'gpt-4.1-mini', anthropic: 'claude-haiku-4-5', local: 'qwen2.5:7b' }
export function compatibleBase(value) {
  let url
  try { url = new URL(value) } catch { throw new Error('NEURALDOC_LLM_BASE_URL muss eine gültige URL sein.') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('LLM-URL ohne Zugangsdaten, Query oder Fragment angeben.')
  return url.href.replace(/\/+$/, '')
}
// Anthropic does not enforce all array constraints. Apply them locally after parsing.
const claudeSchema = (value) => Array.isArray(value) ? value.map(claudeSchema) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([k]) => !['maxItems', 'minItems'].includes(k)).map(([k, v]) => [k, claudeSchema(v)])) : value
export function providerRequest(config, context, systemPrompt, schema, outputLimit) {
  const model = config.model, content = JSON.stringify(context)
  if (config.provider === 'anthropic') return {
    url: 'https://api.anthropic.com/v1/messages',
    headers: { 'Content-Type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' },
    body: { model, max_tokens: outputLimit, system: systemPrompt, messages: [{ role: 'user', content }], output_config: { format: { type: 'json_schema', schema: claudeSchema(schema) } } },
  }
  const local = config.provider === 'local'
  return {
    url: `${config.baseUrl}/chat/completions`,
    headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
    body: {
      model, messages: [{ role: 'system', content: systemPrompt + (config.format === 'json_object' ? `\nAntworte mit JSON in diesem Schema: ${JSON.stringify(schema)}` : '') }, { role: 'user', content }],
      ...(local ? { max_tokens: outputLimit } : { max_completion_tokens: outputLimit }),
      response_format: config.format === 'json_object' ? { type: 'json_object' } : { type: 'json_schema', json_schema: { name: 'documentation_draft', strict: true, schema } },
      stream: false,
    },
  }
}
export function providerResponse(config, raw) {
  if (config.provider === 'anthropic') {
    if (raw.stop_reason !== 'end_turn' || raw.content?.some((p) => p.type === 'tool_use') || raw.content?.some((p) => p.type === 'refusal')) throw new Error('Das Modell hat den Entwurf nicht vollständig abgeschlossen.')
    return { text: (raw.content || []).filter((p) => p.type === 'text').map((p) => p.text).join(''), inputTokens: raw.usage?.input_tokens, outputTokens: raw.usage?.output_tokens }
  }
  const choice = raw.choices?.[0]
  if (choice?.finish_reason !== 'stop' || choice.message?.refusal || choice.message?.tool_calls?.length || typeof choice.message?.content !== 'string') throw new Error('Das Modell hat den Entwurf nicht vollständig abgeschlossen oder abgelehnt.')
  return { text: choice.message.content, inputTokens: raw.usage?.prompt_tokens, outputTokens: raw.usage?.completion_tokens }
}
