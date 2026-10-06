// Why the comment check missed planted items: the model's verdict for the block and what it saw (cached answers only).
//   node --env-file=frontend/.env.local mcp/eval/comments-why.mjs ky-7,httpx-3
import path from 'node:path'
import { draftingConfig } from '../drafting.mjs'
import { commentBlocks } from '../comments.mjs'
import { CHECK_THINKING, cachedCall } from '../check.mjs'
import { COMMENT_PROMPTS, COMMENT_SCHEMAS, commentContext, commentInput, commentSignals, commentWindows, relatedCode } from '../comment-check.mjs'
import { commentEvalDir, loadCommentBench, spec } from './comment-bench.mjs'

const ids = process.argv[2].split(','), config = draftingConfig(), variant = process.argv[3] || 'checklist'
for (const id of ids) {
  const item = spec.planted.find((i) => i.id === id), bench = loadCommentBench(item.repo), context = commentContext(bench.files)
  const lines = bench.items.find((i) => i.id === id).lines, file = context.files.get(item.file)
  const window = commentWindows(file, commentBlocks(file.text, file.path)).find((w) => w.blocks.some((b) => b.start <= lines[1] && lines[0] <= b.end))
  const index = window.blocks.findIndex((b) => b.start <= lines[1] && lines[0] <= b.end)
  const related = relatedCode(file, window, context), content = commentInput(file, window, related, commentSignals(file, window.blocks, context))
  const { raw, cached } = await cachedCall({ system: COMMENT_PROMPTS[variant], content, config, cacheDir: path.join(commentEvalDir, 'cache'), prefix: 'comments', thinking: CHECK_THINKING[config.model], schema: COMMENT_SCHEMAS[variant], fetchImpl: cachedOnly })
  console.log(`${id} ${item.file} window ${window.from}-${window.to} (${window.blocks.length} blocks, ${content.lines.length} chars, ${related.length} related) block c${index + 1} lines ${lines.join('-')} cached=${cached}`)
  console.log('   verdict:', raw.checks?.find((c) => c.id === `c${index + 1}`)?.verdict, '| checks:', raw.checks?.length, '| findings:', raw.findings.length, '| verdicts wrong:', raw.checks?.filter((c) => c.verdict === 'wrong').map((c) => c.id).join(','))
}
async function cachedOnly() { throw new Error('nicht im Cache') }
