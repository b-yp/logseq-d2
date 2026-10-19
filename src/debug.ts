// Visible diagnostics: a small status overlay in the top-level Logseq window.
// Helps figure out why diagrams don't render without opening devtools.
import { getTopContext } from './top-context'

const OVERLAY_ID = 'logseq-d2-debug'

interface DebugState {
  started: boolean
  topDocOk: boolean
  blocks: number
  d2blocks: number
  lastRender: string
  note: string
}

const state: DebugState = {
  started: false,
  topDocOk: false,
  blocks: 0,
  d2blocks: 0,
  lastRender: '-',
  note: '',
}

export function debugEnabled(): boolean {
  try {
    const s = (logseq.settings as any)?.debug
    return s !== false && s !== 'false'
  } catch {
    return true
  }
}

function paint() {
  let doc: Document
  try {
    doc = getTopContext().doc
  } catch {
    return
  }
  let el = doc.getElementById(OVERLAY_ID)
  if (!debugEnabled()) {
    el?.remove()
    return
  }
  if (!el) {
    if (!doc.body) {
      return
    }
    el = doc.createElement('div')
    el.id = OVERLAY_ID
    el.style.cssText =
      'position:fixed;right:12px;bottom:12px;z-index:99999;' +
      'background:rgba(17,17,17,0.92);color:#4ade80;' +
      'font:11px/1.5 monospace;padding:8px 10px;border-radius:6px;' +
      'white-space:pre-wrap;max-width:340px;pointer-events:none;'
    doc.body.appendChild(el)
  }
  el.textContent =
    `logseq-d2 status\n` +
    `loaded: ${state.started ? 'yes' : 'no'}\n` +
    `top document: ${state.topDocOk ? 'ok' : 'BLOCKED'}\n` +
    `code blocks: ${state.blocks} | d2: ${state.d2blocks}\n` +
    `last render: ${state.lastRender}` +
    (state.note ? `\n${state.note}` : '')
}

export function setDebugStarted(topDocOk: boolean, note = '') {
  state.started = true
  state.topDocOk = topDocOk
  state.note = note
  paint()
}

export function setDebugCounts(blocks: number, d2blocks: number) {
  state.blocks = blocks
  state.d2blocks = d2blocks
  paint()
}

export function setDebugRender(s: string) {
  state.lastRender = s
  paint()
}

export function refreshDebugOverlay() {
  paint()
}

/**
 * Console hook for deeper inspection. In the *main* Logseq window console, run:
 *   __logseq_d2_debug()
 * It dumps the code blocks found and their d2-detection results.
 */
export function installDebugHook(isD2Block: (el: HTMLElement) => boolean) {
  try {
    const { doc, win } = getTopContext()
    ;(win as any).__logseq_d2_debug = () => {
      const blocks = Array.from(doc.querySelectorAll('.extensions__code'))
      const info = blocks.slice(0, 5).map((b) => {
        const el = b as HTMLElement
        const ta = el.querySelector('textarea[data-lang]')
        return {
          isD2: isD2Block(el),
          textareaLang: ta?.getAttribute('data-lang') ?? null,
          langLabel: el.querySelector('.extensions__code-lang')?.textContent?.trim() ?? null,
          hasCodeMirror: !!el.querySelector('.CodeMirror'),
          html: el.outerHTML.slice(0, 1500),
        }
      })
      const out = {
        blocksFound: blocks.length,
        topDocOk: true,
        sample: info,
      }
      ;(win as any).console.log('[logseq-d2 debug]', JSON.stringify(out, null, 1))
      return out
    }
  } catch {
    // ignore
  }
}
