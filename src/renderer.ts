import { getCachedHeight, getCachedSvg, renderD2 } from './engine'
import { describeD2Error } from './errors'
import {
  getRenderOptions,
  getSettingsKey,
  getThemeMode,
  invalidateThemeModeCache,
} from './settings'
import { D2_STYLES } from './styles'

const BLOCK_SELECTOR = '.extensions__code, .code-editor, [class*="extensions__code"]'
const BLOCK_CONTENT_SELECTOR = `${BLOCK_SELECTOR}, .CodeMirror, textarea[data-lang], pre code`
const BLOCK_CLASS = 'logseq-d2-block'
const PREVIEW_CLASS = 'logseq-d2-preview'
const WRAP_SELECTOR = '.ui-fenced-code-wrap'
const HANDLED_CLASS = 'logseq-d2-fenced'
const STYLE_ID = 'logseq-d2-style'
const DEBOUNCE_MS = 150

interface CodeMirrorHost extends HTMLElement {
  CodeMirror?: { getValue?: () => string }
}

/**
 * Plugins run in an iframe, while blocks live in the host page.
 */
function getDocument(): Document {
  try {
    if (window.top?.document.body) return window.top.document
  } catch {
    // Cross-origin host: fall back to the plugin document.
  }
  return document
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Accept both a bare diagram and a pasted fenced block. */
function cleanSource(raw: string): string {
  const source = raw.trim()
  if (!source.startsWith('```')) return source
  return source
    .replace(/^```[^\n]*\n?/, '')
    .replace(/\n```$/, '')
    .trim()
}

function languageOf(block: HTMLElement): string {
  const candidates = [
    block.dataset.lang,
    block.querySelector('[data-lang]')?.getAttribute('data-lang'),
    block.querySelector('.extensions__code-lang')?.textContent,
  ]
  const language = candidates
    .map((candidate) => candidate?.trim().toLowerCase())
    .find((candidate) => candidate)

  if (language) return language

  const code = block.querySelector('code[class*="language-"]')
  return code?.className.match(/language-([\w-]+)/)?.[1]?.toLowerCase() ?? ''
}

function extractSource(block: HTMLElement): string {
  const cmElement = block.querySelector<CodeMirrorHost>('.CodeMirror')
  const value = cmElement?.CodeMirror?.getValue?.()
  if (value?.trim()) return cleanSource(value)

  // Fallback for CodeMirror 5 and CodeMirror 6 rendered line DOM.
  const lines = block.querySelectorAll('.CodeMirror-line, .cm-line')
  if (lines.length > 0) {
    const text = Array.from(lines, (line) => line.textContent ?? '').join('\n')
    if (text.trim()) return cleanSource(text)
  }

  const textarea = block.querySelector('textarea')
  if (textarea?.value.trim()) return cleanSource(textarea.value)

  const code = block.querySelector('pre code, pre, code')
  return cleanSource(code?.textContent ?? '')
}

function ensurePreview(block: HTMLElement, doc: Document): HTMLElement {
  block.classList.add(BLOCK_CLASS)
  block.style.overflowAnchor = 'none'

  const host = block.closest<HTMLElement>('.cp__fenced-code-block, .ui-fenced-code-wrap')
  if (host) {
    host.classList.add('logseq-d2-host')
    host.style.overflowAnchor = 'none'
  }

  const existing = block.querySelector<HTMLElement>(`.${PREVIEW_CLASS}`)
  if (existing) return existing

  const preview = doc.createElement('div')
  preview.className = PREVIEW_CLASS
  preview.style.overflowAnchor = 'none'
  block.appendChild(preview)
  return preview
}

function applySvg(preview: HTMLElement, svg: string): void {
  preview.style.minHeight = ''
  preview.style.overflowAnchor = 'none'
  preview.innerHTML = `<div class="logseq-d2-container" style="overflow-anchor: none;">${svg}</div>`
}

/**
 * Called by the official fenced-code renderer once its component is mounted.
 * Marks only its own block as handled, so blocks whose renderer never mounts
 * (or Logseq DB) still use the DOM fallback.
 */
export function markBlockHandled(node: HTMLElement | null): void {
  const wrap = node?.closest<HTMLElement>(WRAP_SELECTOR)
  if (!wrap) return

  wrap.classList.add(HANDLED_CLASS)
  wrap.style.overflowAnchor = 'none'
  wrap.ownerDocument.documentElement.dataset.logseqD2 = 'fenced'
  wrap.querySelectorAll(`.${PREVIEW_CLASS}`).forEach((preview) => preview.remove())
  wrap.querySelectorAll(`.${BLOCK_CLASS}`).forEach((block) => block.classList.remove(BLOCK_CLASS))
}

function forgetBlock(block: HTMLElement): void {
  delete block.dataset.d2Source
  delete block.dataset.d2Settings
  block.classList.remove(BLOCK_CLASS)
  block.querySelector<HTMLElement>(`.${PREVIEW_CLASS}`)?.remove()
}

function renderBlock(block: HTMLElement, doc: Document): void {
  // If this block is inside a fenced wrapper, official fenced renderer handles it.
  // Never inject DOM fallback here to avoid flicker.
  if (block.closest(WRAP_SELECTOR)) {
    forgetBlock(block)
    return
  }

  const source = languageOf(block) === 'd2' ? extractSource(block) : ''
  if (!source) {
    forgetBlock(block)
    return
  }

  const settingsKey = getSettingsKey()
  const existingPreview = block.querySelector<HTMLElement>(`.${PREVIEW_CLASS}`)

  // Block is already rendered with identical source and settings: skip entirely (zero DOM mutations).
  if (
    existingPreview &&
    existingPreview.isConnected &&
    block.dataset.d2Source === source &&
    block.dataset.d2Settings === settingsKey
  ) {
    return
  }

  const preview = existingPreview ?? ensurePreview(block, doc)
  block.dataset.d2Source = source
  block.dataset.d2Settings = settingsKey
  preview.style.overflowAnchor = 'none'

  // Pre-reserve known height so remounting does not cause upward scroll jumps
  const cachedHeight = getCachedHeight(source)
  if (cachedHeight) {
    preview.style.minHeight = `${cachedHeight + 34}px`
  }

  const cachedSvg = getCachedSvg(source)
  if (cachedSvg) {
    applySvg(preview, cachedSvg)
    return
  }

  if (preview.childElementCount === 0) {
    preview.innerHTML = '<div class="logseq-d2-loading" style="overflow-anchor: none;">Rendering diagram…</div>'
  }

  renderD2(source)
    .then((svg) => {
      if (!block.isConnected) return
      if (block.dataset.d2Source !== source || block.dataset.d2Settings !== settingsKey) return
      applySvg(preview, svg)
    })
    .catch((error: unknown) => {
      if (!block.isConnected) return
      if (block.dataset.d2Source !== source || block.dataset.d2Settings !== settingsKey) return
      preview.style.minHeight = ''
      preview.innerHTML =
        `<div class="logseq-d2-error" style="overflow-anchor: none;">` +
        `<div class="logseq-d2-error-title">D2 error</div>` +
        `<div>${escapeHtml(describeD2Error(error))}</div>` +
        `</div>`
    })
}

function scan(doc: Document): void {
  const blocks = new Set<HTMLElement>()

  doc.querySelectorAll<HTMLElement>(BLOCK_SELECTOR).forEach((element) => {
    // Skip blocks inside official fenced code wraps; they are managed by React D2View.
    if (element.closest(WRAP_SELECTOR)) return
    blocks.add(element.closest<HTMLElement>('.extensions__code') ?? element)
  })

  blocks.forEach((block) => renderBlock(block, doc))
}

/** Re-render everything, e.g. after a settings change. */
export function renderAll(): void {
  invalidateThemeModeCache()
  const doc = getDocument()
  publishThemeDiagnostics(doc)
  doc.querySelectorAll<HTMLElement>(`[data-d2-source]`).forEach((block) => {
    delete block.dataset.d2Source
    delete block.dataset.d2Settings
  })
  doc.querySelectorAll(`.${PREVIEW_CLASS}`).forEach((preview) => preview.remove())
  doc.querySelectorAll(`.${BLOCK_CLASS}`).forEach((block) => block.classList.remove(BLOCK_CLASS))
  scan(doc)
}

function publishThemeDiagnostics(doc: Document): void {
  const options = getRenderOptions()
  doc.documentElement.dataset.logseqD2Theme = getThemeMode()
  doc.documentElement.dataset.logseqD2ThemeId = String(options.themeID)
  doc.documentElement.dataset.logseqD2Transparent = String(options.transparentBackground)
}

function injectStyles(doc: Document): void {
  if (!doc.head || doc.getElementById(STYLE_ID)) return

  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = D2_STYLES
  doc.head.appendChild(style)
}

function isOwnMutation(record: MutationRecord): boolean {
  const node = record.target
  const element = node.nodeType === 1 ? (node as Element) : node.parentElement
  if (!element) return false
  return (
    element.closest(`.${PREVIEW_CLASS}`) !== null ||
    element.closest('.logseq-d2-container') !== null
  )
}

function isBlockNode(node: Node): boolean {
  if (node.nodeType !== 1) return false
  const element = node as Element
  return (
    element.matches(BLOCK_CONTENT_SELECTOR) ||
    element.querySelector(BLOCK_CONTENT_SELECTOR) !== null
  )
}

function touchesBlock(record: MutationRecord): boolean {
  const node = record.target
  const element = node.nodeType === 1 ? (node as Element) : node.parentElement
  if (element?.closest(BLOCK_SELECTOR)) return true
  return Array.from(record.addedNodes).some(isBlockNode)
}

function addsBlock(record: MutationRecord): boolean {
  return record.type === 'childList' && Array.from(record.addedNodes).some(isBlockNode)
}

export function startRenderer(): () => void {
  const doc = getDocument()
  if (!doc.body) return () => {}

  injectStyles(doc)
  invalidateThemeModeCache()
  publishThemeDiagnostics(doc)
  doc.documentElement.dataset.logseqD2 = 'active'

  // Suppress scroll anchoring on main scroll containers to prevent jumping when scrolling up
  const mainScroller = doc.getElementById('main-content-container')
  if (mainScroller) {
    mainScroller.style.overflowAnchor = 'none'
  }
  const sideScroller = doc.querySelector<HTMLElement>('.cp__sidebar-main-content')
  if (sideScroller) {
    sideScroller.style.overflowAnchor = 'none'
  }

  scan(doc)

  let timer: ReturnType<typeof setTimeout> | undefined
  let rafId: number | undefined
  const defaultWin = doc.defaultView ?? window
  const MutationObserverImpl = defaultWin.MutationObserver

  const scheduleScan = (debounceMs = 0) => {
    if (timer) clearTimeout(timer)
    if (debounceMs <= 0) {
      if (rafId) return
      rafId = defaultWin.requestAnimationFrame(() => {
        rafId = undefined
        scan(doc)
      })
    } else {
      timer = setTimeout(() => {
        scan(doc)
      }, debounceMs)
    }
  }

  const observer = new MutationObserverImpl((records) => {
    let relevant = false
    let immediate = false

    for (const record of records) {
      if (isOwnMutation(record)) continue

      const targetEl =
        record.target.nodeType === 1
          ? (record.target as Element)
          : record.target.parentElement
      if (targetEl?.closest(WRAP_SELECTOR)) continue

      if (touchesBlock(record)) {
        relevant = true
        if (addsBlock(record)) immediate = true
      }
    }

    if (!relevant) return

    if (immediate) {
      scheduleScan(0)
    } else {
      scheduleScan(DEBOUNCE_MS)
    }
  })

  observer.observe(doc.body, { childList: true, subtree: true, characterData: true })

  return () => {
    observer.disconnect()
    if (timer) clearTimeout(timer)
    if (rafId) defaultWin.cancelAnimationFrame(rafId)

    if (mainScroller) mainScroller.style.overflowAnchor = ''
    if (sideScroller) sideScroller.style.overflowAnchor = ''

    doc.querySelectorAll<HTMLElement>(`[data-d2-source]`).forEach((block) => {
      delete block.dataset.d2Source
      delete block.dataset.d2Settings
    })
    doc.querySelectorAll(`.${BLOCK_CLASS}`).forEach((block) => block.classList.remove(BLOCK_CLASS))
    doc.querySelectorAll(`.${HANDLED_CLASS}`).forEach((wrap) => wrap.classList.remove(HANDLED_CLASS))
    doc.querySelectorAll(`.${PREVIEW_CLASS}`).forEach((preview) => preview.remove())
    doc.getElementById(STYLE_ID)?.remove()
  }
}
