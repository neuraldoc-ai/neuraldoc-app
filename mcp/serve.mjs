import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { middleware } from './handler.mjs'

const root = fileURLToPath(new URL('../frontend/dist/', import.meta.url))
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg' }
http.createServer((req, res) => {
  Promise.resolve(middleware(req, res, () => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return }
    let pathname
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname) } catch { res.writeHead(400); res.end(); return }
    if (pathname === '/health/live') { res.writeHead(200); res.end('ok'); return }
    if (pathname === '/') { res.writeHead(302, { Location: '/app/' }); res.end(); return }
    const relative = pathname === '/app' || pathname.startsWith('/app/') ? 'app/index.html' : pathname.replace(/^\/+/, '')
    const file = path.resolve(root, relative)
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' })
    if (req.method === 'HEAD') res.end()
    else fs.createReadStream(file).pipe(res)
  })).catch((error) => { console.error(error); if (!res.headersSent) res.writeHead(500); res.end() })
}).listen(Number(process.env.PORT ?? 8080), '0.0.0.0')
