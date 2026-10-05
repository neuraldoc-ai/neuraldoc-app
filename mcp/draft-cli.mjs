import fs from 'node:fs'
import { generateDraft } from './drafting.mjs'

const file = process.argv[2]
if (!file) {
  console.error('Aufruf: node --env-file=frontend/.env.local mcp/draft-cli.mjs <kontext.json>')
  process.exitCode = 1
} else {
  try {
    const result = await generateDraft(JSON.parse(fs.readFileSync(file, 'utf8')))
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
