#!/usr/bin/env node
// neuraldoc MCP over stdio (newline-delimited JSON-RPC), for clients that start the server themselves:
//   claude mcp add neuraldoc -- node <pfad>/mcp/stdio.mjs
import readline from 'node:readline'
import { handleMessage } from './handler.mjs'

let client = 'stdio'
const rl = readline.createInterface({ input: process.stdin })
rl.on('line', async (line) => {
  if (!line.trim()) return
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n')
    return
  }
  const batch = Array.isArray(msg) ? msg : [msg]
  const out = []
  for (const m of batch) {
    const r = await handleMessage(m, { client, onInitialize: (info) => (client = info?.name ? `${info.name} (stdio)` : 'stdio') })
    if (r) out.push(r)
  }
  if (out.length) {
    const response = Array.isArray(msg) ? out : out[0]
    process.stdout.write(JSON.stringify(response) + '\n')
  }
})
