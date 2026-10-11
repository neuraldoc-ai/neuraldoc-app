// Embeddings from a local llama.cpp server (Qwen3-Embedding-0.6B, multilingual, trained on code), cached on disk by
// text hash. Start the server first:
//   llama-server -m Qwen3-Embedding-0.6B-Q8_0.gguf --embedding --pooling last -c 8192 -b 8192 -ub 8192 --port 8091 -ngl 99
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { brainDir } from './mine.mjs'

const URL_ = process.env.BRAIN_EMBED_URL || 'http://127.0.0.1:8091'
export const QUERY = 'Instruct: Given a section of product documentation, retrieve the source code that implements what it describes\nQuery: '
const cacheFile = path.join(brainDir, 'embed-cache.bin')
const cache = new Map()
const DIM = 1024
// Cache file: repeated [32-byte hash][DIM float32].
if (fs.existsSync(cacheFile)) {
  const buf = fs.readFileSync(cacheFile), rec = 32 + DIM * 4
  for (let at = 0; at + rec <= buf.length; at += rec) cache.set(buf.subarray(at, at + 32).toString('hex'), new Float32Array(buf.buffer.slice(buf.byteOffset + at + 32, buf.byteOffset + at + rec)))
}
const key = (t) => crypto.createHash('sha256').update(t).digest('hex')
const normalize = (v) => { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; return Float32Array.from(v, (x) => x / n) }

export async function embed(texts, { batch = 32 } = {}) {
  const out = new Array(texts.length), todo = []
  texts.forEach((t, i) => { const v = cache.get(key(t)); if (v) out[i] = v; else todo.push(i) })
  for (let s = 0; s < todo.length; s += batch) {
    const ids = todo.slice(s, s + batch)
    const res = await fetch(`${URL_}/v1/embeddings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: ids.map((i) => texts[i]) }) })
    if (!res.ok) throw new Error(`embedding server: ${res.status} ${(await res.text()).slice(0, 200)}`)
    const data = (await res.json()).data
    const add = []
    data.forEach((d, j) => { const v = normalize(d.embedding); out[ids[j]] = v; cache.set(key(texts[ids[j]]), v); add.push(Buffer.from(key(texts[ids[j]]), 'hex'), Buffer.from(v.buffer)) })
    fs.appendFileSync(cacheFile, Buffer.concat(add))
    if (todo.length > 200 && (s / batch) % 20 === 0) process.stderr.write(`  embed ${s + ids.length}/${todo.length}\r`)
  }
  return out
}

export const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s }
