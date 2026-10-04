/** The two Monaco editors of the IDE: a read-only code editor with one model per file, and a diff editor. */
import { useEffect, useRef, type RefObject } from 'react'
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import { applyTheme, monaco } from './monaco'
import { languageOf, parseDiff } from './model'

const FONT = "ui-monospace, 'Cascadia Code', 'JetBrains Mono', Menlo, Consolas, monospace"

/** Keeps Monaco's theme in sync with the app's light/dark class and with the surface the editor sits on. */
function useAppTheme(host: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = document.documentElement
    const apply = () => host.current && applyTheme(root.classList.contains('dark'), host.current)
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [host])
}

const models = new Map<string, Monaco.editor.ITextModel>()
const viewStates = new Map<string, Monaco.editor.ICodeEditorViewState | null>()

function modelFor(path: string, text: string) {
  let model = models.get(path)
  if (!model || model.isDisposed()) {
    model = monaco.editor.createModel(text, languageOf(path).id, monaco.Uri.parse(`inmemory:///${path}`))
    models.set(path, model)
  }
  return model
}

export type Cursor = { line: number; column: number; selected: number }

export function CodeEditor({ path, text, reveal, onCursor }: { path: string; text: string; reveal?: { line: number; nonce: number }; onCursor: (c: Cursor) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const cursorCb = useRef(onCursor)
  useEffect(() => {
    cursorCb.current = onCursor
  })
  useAppTheme(host)

  useEffect(() => {
    const ed = monaco.editor.create(host.current!, {
      readOnly: true,
      readOnlyMessage: { value: 'Schreibgeschützt: Beispieldatensatz, Stand release/26.4' },
      automaticLayout: true,
      fontFamily: FONT,
      fontSize: 12.5,
      lineHeight: 20,
      minimap: { enabled: true, renderCharacters: false, scale: 1 },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      renderWhitespace: 'selection',
      renderLineHighlight: 'all',
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      stickyScroll: { enabled: true },
      folding: true,
      showFoldingControls: 'always',
      padding: { top: 8, bottom: 8 },
      scrollbar: { verticalScrollbarSize: 12, horizontalScrollbarSize: 12 },
      fixedOverflowWidgets: true,
    })
    editor.current = ed
    const sub = ed.onDidChangeCursorSelection(() => {
      const pos = ed.getPosition()
      const sel = ed.getSelection()
      const model = ed.getModel()
      if (pos) cursorCb.current({ line: pos.lineNumber, column: pos.column, selected: sel && model && !sel.isEmpty() ? model.getValueInRange(sel).length : 0 })
    })
    return () => {
      const model = ed.getModel()
      if (model) viewStates.set(model.uri.toString(), ed.saveViewState())
      sub.dispose()
      ed.dispose()
      editor.current = null
    }
  }, [])

  useEffect(() => {
    const ed = editor.current!
    const previous = ed.getModel()
    if (previous) viewStates.set(previous.uri.toString(), ed.saveViewState())
    const model = modelFor(path, text)
    ed.setModel(model)
    const state = viewStates.get(model.uri.toString())
    if (state) ed.restoreViewState(state)
    else ed.setScrollTop(0)
  }, [path, text])

  useEffect(() => {
    if (!reveal) return
    const ed = editor.current!
    ed.revealLineInCenter(reveal.line)
    ed.setSelection({ startLineNumber: reveal.line, startColumn: 1, endLineNumber: reveal.line, endColumn: ed.getModel()!.getLineMaxColumn(reveal.line) })
  }, [reveal, path])

  return <div ref={host} className='h-full w-full bg-card' />
}

export function DiffViewer({ diff, path, sideBySide }: { diff: string; path: string; sideBySide: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<Monaco.editor.IStandaloneDiffEditor | null>(null)
  useAppTheme(host)

  useEffect(() => {
    const ed = monaco.editor.createDiffEditor(host.current!, {
      readOnly: true,
      originalEditable: false,
      automaticLayout: true,
      fontFamily: FONT,
      fontSize: 12.5,
      lineHeight: 20,
      renderSideBySide: sideBySide,
      useInlineViewWhenSpaceIsLimited: true,
      renderOverviewRuler: true,
      ignoreTrimWhitespace: false,
      hideUnchangedRegions: { enabled: true, contextLineCount: 3, minimumLineCount: 4, revealLineCount: 20 },
      scrollBeyondLastLine: false,
      minimap: { enabled: false },
      padding: { top: 8, bottom: 8 },
      fixedOverflowWidgets: true,
    })
    editor.current = ed
    return () => {
      const { original, modified } = ed.getModel() ?? {}
      ed.dispose()
      original?.dispose()
      modified?.dispose()
      editor.current = null
    }
    // the view mode is changed through updateOptions below, the editor itself is created once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    editor.current?.updateOptions({ renderSideBySide: sideBySide })
  }, [sideBySide])

  useEffect(() => {
    const ed = editor.current!
    const sides = parseDiff(diff)
    const language = languageOf(path).id
    const previous = ed.getModel()
    const original = monaco.editor.createModel(sides.original, language)
    const modified = monaco.editor.createModel(sides.modified, language)
    ed.setModel({ original, modified })
    ed.getOriginalEditor().updateOptions({ lineNumbers: (n) => sides.originalNumbers[n - 1] ?? '' })
    ed.getModifiedEditor().updateOptions({ lineNumbers: (n) => sides.modifiedNumbers[n - 1] ?? '' })
    previous?.original.dispose()
    previous?.modified.dispose()
  }, [diff, path])

  return <div ref={host} className='h-full w-full bg-card' />
}

/* ---------- SQL editor (editable) ---------- */

let sqlNames: { label: string; detail: string; kind: 'table' | 'column' }[] = []
let providerRegistered = false

/** Table and column names for completion, taken from the live catalog. */
export function setSqlNames(names: typeof sqlNames) {
  sqlNames = names
  if (providerRegistered) return
  providerRegistered = true
  monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['.', ' '],
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position)
      const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn }
      return {
        suggestions: sqlNames.map((n) => ({
          label: n.label,
          detail: n.detail,
          insertText: n.label,
          range,
          kind: n.kind === 'table' ? monaco.languages.CompletionItemKind.Struct : monaco.languages.CompletionItemKind.Field,
        })),
      }
    },
  })
}

export function SqlEditor({ value, onChange, onRun }: { value: string; onChange: (v: string) => void; onRun: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const callbacks = useRef({ onChange, onRun })
  useEffect(() => {
    callbacks.current = { onChange, onRun }
  })
  useAppTheme(host)

  useEffect(() => {
    const model = monaco.editor.createModel(value, 'sql')
    const ed = monaco.editor.create(host.current!, {
      model,
      automaticLayout: true,
      fontFamily: FONT,
      fontSize: 13,
      lineHeight: 21,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderLineHighlight: 'line',
      padding: { top: 10, bottom: 10 },
      fixedOverflowWidgets: true,
      quickSuggestions: { other: true, comments: false, strings: false },
    })
    editor.current = ed
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => callbacks.current.onRun())
    const sub = ed.onDidChangeModelContent(() => callbacks.current.onChange(ed.getValue()))
    return () => {
      sub.dispose()
      ed.dispose()
      model.dispose()
      editor.current = null
    }
    // the editor owns its text after creation; `value` below only pushes changes made from outside
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const ed = editor.current
    if (ed && ed.getValue() !== value) ed.setValue(value)
  }, [value])

  return <div ref={host} className='h-full w-full bg-card' />
}