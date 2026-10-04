/**
 * Monaco (the editor of VS Code), bundled locally: no CDN. Only the languages the example repository needs are loaded,
 * each as its own lazy chunk. This module is only imported by the lazily loaded IDE, so Monaco stays out of the main bundle.
 */
import 'monaco-editor/esm/vs/editor/edcore.main.js'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/kotlin/kotlin.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/pascal/pascal.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js'
import 'monaco-editor/esm/vs/language/json/monaco.contribution.js'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker.js?worker'

self.MonacoEnvironment = {
  getWorker: (_id, label) => (label === 'json' ? new JsonWorker() : new EditorWorker()),
}

// Disposing an editor while Monaco still computes something rejects its internal promises; that is expected, not an error.
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason?.name === 'Canceled' || e.reason?.message === 'no diff result available') e.preventDefault()
})

/** Any CSS color (oklch included) as #rrggbb, which Monaco's theme engine understands. */
function toHex(color: string) {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** Applies the app's light/dark look to every editor; `surface` is the element whose background the editor should match. */
export function applyTheme(dark: boolean, surface: HTMLElement) {
  const bg = toHex(getComputedStyle(surface).backgroundColor)
  monaco.editor.defineTheme('neuraldoc', {
    base: dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': bg,
      'editorGutter.background': bg,
      'minimap.background': bg,
      'editorStickyScroll.background': bg,
      'diffEditor.unchangedRegionBackground': dark ? '#ffffff0d' : '#0000000a',
    },
  })
  monaco.editor.setTheme('neuraldoc')
}

export { monaco }
