import { renderD2, resetD2 } from './d2-engine'
import { getSettingsKey } from './settings'
import { D2_STYLES } from './styles'
import { getTopContext, topLog } from './top-context'
import {
  setDebugStarted,
  setDebugCounts,
  setDebugRender,
  installDebugHook,
} from './debug'

const PREVIEW_CLASS = 'logseq-d2-preview'
const DEBUG_OVERLAY_ID = 'logseq-d2-debug'
const CODE_ATTR = 'data-d2-code'
const SETTINGS_ATTR = 'data-d2-settings'
const STYLE_ID = 'logseq-d2-dynamic-style'

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

function extractCode(cmEl: HTMLElement): string {
  try {
    const cm = (cmEl as any).CodeMirror
    if (cm?.getValue) {
      return cm.getValue()
    }
  } catch {
    // ignore
  }
  const lines = cmEl.querySelectorAll('.CodeMirror-line')
  if (lines.length > 0) {
    return Array.from(lines)
      .map((l) => l.textContent || '')
      .join('\n')
  }
  return cmEl.innerText || ''
}

/**
 * Detect whether a code block is a D2 block.
 * Logseq marks the language in two places (see frontend/extensions/code.cljs):
 *   1. <textarea data-lang="d2"> inside .code-editor (most reliable)
 *   2. .extensions__code-lang label showing the lower-cased language name
 */
export function isD2Block(blockEl: HTMLElement): boolean {
  const textarea = blockEl.querySelector('textarea[data-lang]')
  if (textarea) {
    const lang = (textarea.getAttribute('data-lang') || '').trim().toLowerCase()
    if (lang) {
      return lang === 'd2'
    }
  }
  const langLabel = blockEl.querySelector('.extensions__code-lang')
  if (langLabel) {
    return (langLabel.textContent || '').trim().toLowerCase() === 'd2'
  }
  return false
}

function hasCodeMirror(blockEl: HTMLElement): boolean {
  return blockEl.querySelector('.CodeMirror') !== null
}

async function renderD2Block(blockEl: HTMLElement): Promise<void> {
  const cmEl = blockEl.querySelector('.CodeMirror') as HTMLElement | null
  if (!cmEl) {
    return
  }
  const code = extractCode(cmEl).trim()
  if (!code || !isD2Block(blockEl)) {
    return
  }

  const settingsKey = getSettingsKey()
  const lastCode = blockEl.getAttribute(CODE_ATTR)
  const lastSettings = blockEl.getAttribute(SETTINGS_ATTR)
  const { doc } = getTopContext()
  let previewEl = blockEl.querySelector(`.${PREVIEW_CLASS}`) as HTMLElement | null

  if (lastCode === code && lastSettings === settingsKey && previewEl) {
    return
  }

  // Claim the block early so concurrent scans don't start duplicate renders.
  blockEl.setAttribute(CODE_ATTR, code)
  blockEl.setAttribute(SETTINGS_ATTR, settingsKey)

  if (!previewEl) {
    previewEl = doc.createElement('div')
    previewEl.className = PREVIEW_CLASS
    blockEl.appendChild(previewEl)
  }

  // Staleness token: a newer render invalidates this one.
  const token = (((blockEl as any).__d2Token || 0) + 1) as number
  ;(blockEl as any).__d2Token = token

  previewEl.innerHTML = `<div class="logseq-d2-loading">Rendering D2 diagram…</div>`

  try {
    const svg = await renderD2(code)
    if ((blockEl as any).__d2Token !== token || !blockEl.isConnected) {
      return
    }
    ;(previewEl as HTMLElement).innerHTML = `<div class="logseq-d2-container">${svg}</div>`
    setDebugRender('ok')
  } catch (err: any) {
    if ((blockEl as any).__d2Token !== token || !blockEl.isConnected) {
      return
    }
    // Allow a later scan to retry after a failure.
    blockEl.removeAttribute(CODE_ATTR)
    const msg = escapeHtml(err?.message || String(err))
    ;(previewEl as HTMLElement).innerHTML = `<div class="logseq-d2-error">D2 render failed: ${msg}</div>`
    setDebugRender(`ERROR: ${err?.message || String(err)}`.slice(0, 120))
    topLog('render failed:', err?.message || err)
  }

  bindLiveRerender(blockEl, cmEl)
}

// Re-render (debounced) while the user edits the code.
function bindLiveRerender(blockEl: HTMLElement, cmEl: HTMLElement) {
  if ((cmEl as any).__d2Bound) {
    return
  }
  ;(cmEl as any).__d2Bound = true
  let timer: ReturnType<typeof setTimeout> | null = null
  const onChange = () => {
    if (timer) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      // Invalidate the cache so the next render uses fresh code.
      blockEl.removeAttribute(CODE_ATTR)
      void renderD2Block(blockEl)
    }, 500)
  }
  cmEl.addEventListener('input', onChange)
  cmEl.addEventListener('keyup', onChange)
  try {
    const cm = (cmEl as any).CodeMirror
    if (cm?.on) {
      cm.on('change', onChange)
    }
  } catch {
    // ignore
  }
}

export function scanAndRenderAll(root?: ParentNode) {
  let blocks: NodeListOf<Element>
  try {
    const { doc } = getTopContext()
    const scope: ParentNode = root || doc
    blocks = scope.querySelectorAll(
      '.extensions__code, .code-editor, [class*="extensions__code"]'
    )
  } catch {
    setDebugCounts(0, 0)
    return
  }
  let d2count = 0
  blocks.forEach((el) => {
    const blockEl = (el.closest('.extensions__code') || el) as HTMLElement
    if (hasCodeMirror(blockEl) && isD2Block(blockEl)) {
      d2count++
    }
    void renderD2Block(blockEl)
  })
  setDebugCounts(blocks.length, d2count)
}

/** Clear render caches so the next scan re-renders everything (e.g. after a settings change). */
export function refreshAll() {
  try {
    const { doc } = getTopContext()
    doc.querySelectorAll(`[${CODE_ATTR}]`).forEach((el) => {
      el.removeAttribute(CODE_ATTR)
      el.removeAttribute(SETTINGS_ATTR)
    })
  } catch {
    // ignore
  }
  scanAndRenderAll()
}

export function initDomObserver(): () => void {
  let doc: Document
  let win: any
  try {
    ;({ doc, win } = getTopContext())
  } catch (err: any) {
    setDebugStarted(false, `top context failed: ${err?.message || err}`)
    return () => {}
  }

  const topDocOk = (() => {
    try {
      return !!(window.top && window.top.document)
    } catch {
      return false
    }
  })()
  setDebugStarted(true, topDocOk ? '' : 'using iframe document (top blocked)')

  if (!doc.body) {
    setDebugStarted(true, 'waiting for document.body…')
    doc.addEventListener(
      'DOMContentLoaded',
      () => {
        initDomObserver()
      },
      { once: true }
    )
    return () => {}
  }

  // 1. Inject styles into the top-level document.
  try {
    let styleTag = doc.getElementById(STYLE_ID) as HTMLStyleElement | null
    if (!styleTag) {
      styleTag = doc.createElement('style')
      styleTag.id = STYLE_ID
      doc.head.appendChild(styleTag)
    }
    styleTag.textContent = D2_STYLES
  } catch {
    // ignore
  }

  resetD2()
  installDebugHook(isD2Block)

  // 2. Initial scan.
  scanAndRenderAll()

  // 3. Watch for DOM changes, ignoring mutations inside our own preview
  //    containers and the debug overlay.
  let mutationTimer: ReturnType<typeof setTimeout> | null = null
  const observer = new win.MutationObserver((mutations: MutationRecord[]) => {
    const isSelfChange = mutations.every((m: MutationRecord) => {
      const target = m.target as HTMLElement
      return (
        target?.closest?.(`.${PREVIEW_CLASS}, #${DEBUG_OVERLAY_ID}`) !== null
      )
    })
    if (isSelfChange) {
      return
    }
    if (mutationTimer) {
      clearTimeout(mutationTimer)
    }
    mutationTimer = setTimeout(() => {
      scanAndRenderAll()
    }, 300)
  })

  observer.observe(doc.body, { childList: true, subtree: true })

  topLog('DOM observer started (DB-compatible renderer)')

  return () => {
    observer.disconnect()
    resetD2()
  }
}
