import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { middleware } from './handler.mjs'
import { startWatch } from './source-watch.mjs'
import { setupStatus } from './setup.mjs'
import { log, logError } from './log.mjs'

process.on('unhandledRejection', (error) => logError('process', error))
process.on('uncaughtException', (error) => { logError('process', error); process.exit(1) })
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { log.info('server', `${signal} empfangen, beende`); process.exit(0) })

const root = fileURLToPath(new URL('../frontend/dist/', import.meta.url))
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg' }
const port = Number(process.env.PORT ?? 8080)
// The showcase is its own image (docker build --target showcase) with the MOBIQ submodules under datasets/.
if (process.env.NEURALDOC_MODE === 'showcase' && !fs.existsSync(fileURLToPath(new URL('../datasets/mobiq/data/dashboard.json', import.meta.url)))) {
  log.error('server', 'NEURALDOC_MODE=showcase braucht den MOBIQ-Datensatz. Image mit docker build --target showcase bauen (Repository mit --recursive klonen).')
  process.exit(1)
}
const server = http.createServer((req, res) => {
  Promise.resolve(middleware(req, res, () => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return }
    let pathname
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname) } catch { res.writeHead(400); res.end(); return }
    if (pathname === '/health/live') { res.writeHead(200); res.end('ok'); return }
    // A landing page built into dist/index.html (a hosted demo) is the start page; otherwise the app is.
    if (pathname === '/' && !fs.existsSync(path.join(root, 'index.html'))) { res.writeHead(302, { Location: '/app/' }); res.end(); return }
    const relative = pathname === '/' ? 'index.html' : pathname === '/app' || pathname.startsWith('/app/') ? 'app/index.html' : pathname.replace(/^\/+/, '')
    let file = path.resolve(root, relative)
    // A page in its own folder (the legal pages of a hosted landing page): /impressum and /impressum/.
    if (!path.extname(file) && fs.existsSync(path.join(file, 'index.html'))) file = path.join(file, 'index.html')
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' })
    if (req.method === 'HEAD') res.end()
    else fs.createReadStream(file).pipe(res)
  })).catch((error) => { logError('http', error, { method: req.method, url: req.url }); if (!res.headersSent) res.writeHead(500); res.end() })
})
server.on('error', (error) => { logError('server', error, { port }); process.exit(1) })
server.listen(port, '0.0.0.0', () => {
  const setup = setupStatus(), mode = process.env.NEURALDOC_MODE === 'showcase' ? 'showcase (Beispieldaten)' : 'eigene Projekte'
  log.info('server', `neuraldoc läuft auf http://localhost:${port}/app/`, { mode, state: process.env.NEURALDOC_STATE_DIR || 'mcp/state' })
  startWatch()
  if (!fs.existsSync(path.join(root, 'app', 'index.html'))) log.error('server', 'Oberfläche fehlt: frontend/dist wurde nicht gebaut (npm run build).')
  log.info('server', 'Konfiguration', { entscheidungsmodell: setup.decision.configured ? setup.decision.label : setup.decision.provider === 'off' ? 'aus' : `${setup.decision.label} unvollständig`, llm: setup.drafting.configured ? `${setup.drafting.label} ${setup.drafting.model}` : `nicht eingerichtet (${setup.drafting.error || 'Key fehlt'})` })
})
