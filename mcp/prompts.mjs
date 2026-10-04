// MCP prompts are user-selected workflows, not additional executable tools.
export const prompts = [
  {
    name: 'ticket_context', title: 'Ticket vorbereiten',
    description: 'Regeln, Code-Stellen, Doku-Stand und offene Fragen vor dem Programmieren abrufen.',
    arguments: [{ name: 'ticket', description: 'Jira-Ticket, z. B. MOB-4844', required: true }],
    render: ({ ticket }) => `Rufe neuraldoc.ticket_context mit ticket=${JSON.stringify(ticket)} auf. Fasse Geschäftsregeln, Code-Stellen, Doku-Stand und offene Fragen zusammen. Benenne Abweichungen zwischen Doku und Code.`,
  },
  {
    name: 'ask', title: 'Produktfrage beantworten',
    description: 'Eine MOBIQ-Fachfrage anhand der Doku beantworten und gegen den Code prüfen.',
    arguments: [{ name: 'question', description: 'Die Fachfrage, Deutsch oder Englisch', required: true }],
    render: ({ question }) => `Rufe neuraldoc.ask mit question=${JSON.stringify(question)} auf. Beantworte die Frage mit Quellen und Wahrheitsstatus. Wo Doku und Code abweichen, beschreibe das Verhalten des Codes.`,
  },
  {
    name: 'check_change', title: 'Doku-Auswirkungen prüfen',
    description: 'Entwürfe und Freigabelink für einen Merge-Request oder ein Ticket abrufen.',
    arguments: [{ name: 'change', description: 'Merge-Request (!1287) oder Jira-Ticket (MOB-4812)', required: true }],
    render: ({ change }) => {
      if (!/^(?:!?\d+|MOB-\d+)$/i.test(change)) throw new Error('change muss eine MR-Nummer oder ein Jira-Ticket sein.')
      const args = /^MOB-/i.test(change) ? { ticket: change.toUpperCase() } : { merge_request: change }
      return `Rufe neuraldoc.check_change mit ${JSON.stringify(args)} auf. Erhalte jede Originalquelle, Stelle und konkrete Änderung einschließlich Zahlen, Feldern und Sonderfällen. Prüfe den Antwortentwurf mit check_change und answer für dieselbe Änderung; übernimm anschließend die vervollständigte Antwort unverändert, ohne weitere Zusammenfassung. Nenne offene Fragen und den Freigabelink. Schreibe Doku nicht selbst nach Confluence oder SharePoint; neuraldoc übernimmt das nach der Freigabe. Ein erneuter Aufruf zeigt den Freigabestand.`
    },
  },
]

export function promptList(catalog = prompts) {
  return catalog.map(({ render, ...metadata }) => metadata)
}

export function getPrompt(name, args = {}, catalog = prompts) {
  const prompt = catalog.find((p) => p.name === name)
  if (!prompt) throw new Error(`Unbekannter Prompt: ${name}`)
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('arguments muss ein Objekt sein.')
  const allowed = new Set((prompt.arguments ?? []).map((a) => a.name))
  for (const key of Object.keys(args)) {
    if (!allowed.has(key) || typeof args[key] !== 'string') throw new Error(`Ungültiges Prompt-Argument: ${key}`)
  }
  for (const a of prompt.arguments ?? []) {
    if (a.required && !args[a.name]?.trim()) throw new Error(`Prompt-Argument fehlt: ${a.name}`)
  }
  return { description: prompt.description, messages: [{ role: 'user', content: { type: 'text', text: prompt.render(args) } }] }
}
