#!/usr/bin/env node
// Standalone neuraldoc MCP server (Streamable HTTP). The Vite dev server mounts the same handler,
// so while the app runs the endpoint is also available at http://localhost:5174/mcp.
import http from 'node:http'
import { TOKEN, middleware } from './handler.mjs'

const port = Number(process.env.PORT ?? 8787)
http
  .createServer((req, res) => middleware(req, res, () => {
    res.writeHead(404)
    res.end()
  }))
  .listen(port, '127.0.0.1', () => {
    console.log(`neuraldoc MCP: http://localhost:${port}/mcp  (Authorization: Bearer ${TOKEN})`)
  })
