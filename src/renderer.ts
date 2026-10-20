import { getCachedSvg, renderD2 } from './engine'
import { describeD2Error } from './errors'
import {
  copySvgToClipboard,
  downloadPngFile,
  downloadSvgFile,
} from './export-utils'
import { ICONS } from './icons'
import { getDefaultViewMode, getSettingsKey, invalidateThemeModeCache } from './settings'
import { D2_STYLES } from './styles'

const BLOCK_SELECTOR = '.extensions__code, .code-editor, [class*="extensions__code"]'
const BLOCK_CONTENT_SELECTOR = `${BLOCK_SELECTOR}, .CodeMirror, textarea[data-lang], pre code`
const BLOCK_CLASS = 'logseq-d2-block'
const PREVIEW_CLASS = 'logseq-d2-preview'
const TOOLBAR_CLASS = 'logseq-d2-toolbar'
/**
 * Marker added to Logseq's own `.code-block-actions` while (and only while) the
 * plugin has put its view-mode buttons in it. All CSS that touches the native
 * action bar is gated behind this class, so other code blocks stay untouched.
 */
const ACTIONS_CLASS = 'logseq-d2-code-actions'
const WRAP_SELECTOR = '.ui-fenced-code-wrap'
const HANDLED_CLASS = 'logseq-d2-fenced'
const STYLE_ID = 'logseq-d2-style'
const DEBOUNCE_MS = 150

type D2ViewMode = 'diagram' | 'both' | 'code'

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

function getD2CodeBlockContainer(el: HTMLElement): HTMLElement | null {
  return (
    el.closest<HTMLElement>('.extensions__code, [class*="extensions__code"]') ||
    (el.classList.contains('extensions__code') ? el : null)
  )
}

function findCodeBlockActions(targetBlock: HTMLElement): HTMLElement | null {
  // 1. 在当前 targetBlock 自身及其子树内查找 .code-block-actions
  let actions = targetBlock.querySelector<HTMLElement>('.code-block-actions')
  if (actions) return actions

  // 2. 检查前后的直接兄弟节点
  let prev = targetBlock.previousElementSibling
  while (prev) {
    if (prev.classList.contains('code-block-actions')) return prev as HTMLElement
    actions = prev.querySelector<HTMLElement>('.code-block-actions')
    if (actions) return actions
    prev = prev.previousElementSibling
  }

  let next = targetBlock.nextElementSibling
  while (next) {
    if (next.classList.contains('code-block-actions')) return next as HTMLElement
    actions = next.querySelector<HTMLElement>('.code-block-actions')
    if (actions) return actions
    next = next.nextElementSibling
  }

  // 3. 向上逐层查找操作栏。
  //    允许后代查询（有些 build 里操作栏并不是直接子级），但必须保证该作用域
  //    里只有一个代码块；否则宁可返回 null 走浮动兜底，也不去认领别的块的按钮。
  let curr: HTMLElement | null = targetBlock.parentElement
  while (curr && !curr.classList.contains('page-blocks')) {
    const direct = curr.querySelector<HTMLElement>(':scope > .code-block-actions')
    if (direct) return direct

    const nested = curr.querySelector<HTMLElement>('.code-block-actions')
    if (nested) {
      const codeBlocks = curr.querySelectorAll<HTMLElement>('.extensions__code, .code-editor')
      if (codeBlocks.length <= 1) return nested
    }

    if (curr.classList.contains('ls-block')) break
    curr = curr.parentElement
  }

  return null
}

function findTargetBlockFromBtn(btn: HTMLElement): HTMLElement | null {
  // 1. 如果按钮直接在代码块内部
  let block = btn.closest<HTMLElement>(
    '.extensions__code, .code-editor, [class*="extensions__code"]',
  )
  if (block) return block

  // 2. 如果按钮在 code-block-actions 内部，在其直接关联的兄弟/父级容器中查找
  const actions = btn.closest<HTMLElement>('.code-block-actions')
  if (actions) {
    let next = actions.nextElementSibling
    while (next) {
      if (
        next.classList.contains('extensions__code') ||
        next.classList.contains('code-editor') ||
        next.querySelector('.extensions__code, .code-editor')
      ) {
        return (
          next.closest<HTMLElement>('.extensions__code') ||
          next.querySelector<HTMLElement>('.extensions__code, .code-editor') ||
          (next as HTMLElement)
        )
      }
      next = next.nextElementSibling
    }

    let prev = actions.previousElementSibling
    while (prev) {
      if (
        prev.classList.contains('extensions__code') ||
        prev.classList.contains('code-editor') ||
        prev.querySelector('.extensions__code, .code-editor')
      ) {
        return (
          prev.closest<HTMLElement>('.extensions__code') ||
          prev.querySelector<HTMLElement>('.extensions__code, .code-editor') ||
          (prev as HTMLElement)
        )
      }
      prev = prev.previousElementSibling
    }

    const parent = actions.parentElement
    if (parent) {
      block = parent.querySelector<HTMLElement>(
        '.extensions__code, .code-editor, [class*="extensions__code"]',
      )
      if (block) return block
    }
  }

  // 3. 在包含当前操作的大纲块范围内查找，且只在该范围内「仅有一个代码块」时
  //    才敢推断归属；一个块里有多个代码块时宁可不动，也不要把模式应用到别人身上。
  const outlineBlock = btn.closest<HTMLElement>('.block-content, .ls-block')
  if (outlineBlock) {
    const candidates = outlineBlock.querySelectorAll<HTMLElement>(
      '.extensions__code, .code-editor',
    )
    if (candidates.length === 1) return candidates[0]
  }

  return null
}

function updateToolbarActive(toolbar: HTMLElement, mode: D2ViewMode): void {
  toolbar.querySelectorAll<HTMLButtonElement>('.d2-seg-btn').forEach((btn) => {
    if (btn.dataset.mode === mode) {
      btn.classList.add('active')
    } else {
      btn.classList.remove('active')
    }
  })
}

function applyViewMode(targetBlock: HTMLElement, mode: D2ViewMode): void {
  const block = getD2CodeBlockContainer(targetBlock) || targetBlock

  block.dataset.d2Mode = mode
  block.classList.add(BLOCK_CLASS)

  // The only thing written onto Logseq's `.code-block-actions` is this adoption
  // marker, and it is re-asserted here because React can rewrite the bar's
  // className on re-render. Nothing else on the native container is mutated.
  const actions = findCodeBlockActions(block)
  if (actions?.querySelector(`.${TOOLBAR_CLASS}`)) {
    actions.classList.add(ACTIONS_CLASS)
  }

  const preview =
    block.querySelector<HTMLElement>(`.${PREVIEW_CLASS}`) ||
    block.parentElement?.querySelector<HTMLElement>(`.${PREVIEW_CLASS}`) ||
    actions?.parentElement?.querySelector<HTMLElement>(`.${PREVIEW_CLASS}`)

  if (preview) {
    // Spacing lives in D2_STYLES (scoped per view mode); only visibility is
    // toggled from here.
    preview.style.display = mode === 'code' ? 'none' : ''
  }

  // 控制当前代码块内的代码编辑器主体显隐，保留外部容器以确保操作栏不被误杀
  const editorNodes = block.querySelectorAll<HTMLElement>('.CodeMirror, .cm-editor, pre code')
  editorNodes.forEach((node) => {
    node.style.display = mode === 'diagram' ? 'none' : ''
  })

  // 统一更新范围内所有的工具栏按钮高亮状态
  const searchRoot = actions?.parentElement || block.parentElement || block
  const toolbars = searchRoot.querySelectorAll<HTMLElement>(`.${TOOLBAR_CLASS}`)
  toolbars.forEach((toolbar) => updateToolbarActive(toolbar, mode))
}

function initGlobalEvents(doc: Document): () => void {
  const onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null
    const btn = target?.closest<HTMLButtonElement>('.d2-seg-btn')
    if (!btn) return

    e.stopPropagation()
    e.preventDefault()

    const mode = btn.dataset.mode as D2ViewMode
    if (!mode) return

    // 立即直接更新当前点击按钮所属工具栏的高亮状态
    const currentToolbar = btn.closest<HTMLElement>(`.${TOOLBAR_CLASS}`)
    if (currentToolbar) {
      updateToolbarActive(currentToolbar, mode)
    }

    const block = findTargetBlockFromBtn(btn)
    if (block) {
      applyViewMode(block, mode)
    }
  }

  const onMouseDown = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null
    if (target?.closest('.d2-seg-btn, .logseq-d2-btn')) {
      e.stopPropagation()
      e.preventDefault()
    }
  }

  // 采用捕获阶段，确保优先级最高，不被 Logseq 内部编辑器抢先拦截
  doc.addEventListener('click', onClick, true)
  doc.addEventListener('mousedown', onMouseDown, true)

  return () => {
    doc.removeEventListener('click', onClick, true)
    doc.removeEventListener('mousedown', onMouseDown, true)
  }
}

function ensureToolbar(block: HTMLElement, doc: Document): HTMLElement {
  const host = getD2CodeBlockContainer(block) || block
  const actions = findCodeBlockActions(host)
  const targetParent = actions || host

  // 全面清理脱落残留：清理 host、父级等所有不在目标容器内的旧 toolbar
  const rootScope = actions?.parentElement || host.parentElement || host
  rootScope.querySelectorAll(`.${TOOLBAR_CLASS}`).forEach((t) => {
    if (t.parentElement !== targetParent) {
      t.remove()
    }
  })

  const currentMode = (host.dataset.d2Mode as D2ViewMode) || getDefaultViewMode()

  // 检查是否已经在目标容器中
  const existingInTarget = targetParent.querySelector<HTMLElement>(`:scope > .${TOOLBAR_CLASS}`)
  if (existingInTarget) {
    updateToolbarActive(existingInTarget, currentMode)
    applyViewMode(host, currentMode)
    return existingInTarget
  }

  // 严格只清理当前 targetParent 内部遗留的 toolbar
  targetParent
    .querySelectorAll(`:scope > .${TOOLBAR_CLASS}, :scope > .logseq-d2-segmented`)
    .forEach((t) => t.remove())

  const toolbar = doc.createElement('div')
  toolbar.className = `${TOOLBAR_CLASS} logseq-d2-segmented`
  if (actions) {
    // Mark the native action bar as adopted so `styles.ts` can style it
    // without leaking onto every other code block in the app.
    actions.classList.add(ACTIONS_CLASS)
  } else {
    toolbar.classList.add('d2-toolbar-floating')
  }

  toolbar.innerHTML = `
    <button type="button" class="d2-seg-btn${currentMode === 'diagram' ? ' active' : ''}" data-mode="diagram" title="View diagram only">
      <span class="d2-seg-icon">${ICONS.diagram}</span>
      <span class="d2-seg-label">Diagram</span>
    </button>
    <button type="button" class="d2-seg-btn${currentMode === 'both' ? ' active' : ''}" data-mode="both" title="View both code and diagram">
      <span class="d2-seg-icon">${ICONS.both}</span>
      <span class="d2-seg-label">Both</span>
    </button>
    <button type="button" class="d2-seg-btn${currentMode === 'code' ? ' active' : ''}" data-mode="code" title="View code only">
      <span class="d2-seg-icon">${ICONS.code}</span>
      <span class="d2-seg-label">Code</span>
    </button>
    ${actions ? '<span class="d2-seg-divider"></span>' : ''}
  `

  if (targetParent.firstChild) {
    targetParent.insertBefore(toolbar, targetParent.firstChild)
  } else {
    targetParent.appendChild(toolbar)
  }

  applyViewMode(host, currentMode)
  return toolbar
}

function ensurePreview(block: HTMLElement, doc: Document): HTMLElement {
  // `overflow-anchor` comes from D2_STYLES (scoped to `.logseq-d2-block` /
  // `.logseq-d2-host`) instead of writing inline styles onto Logseq's nodes.
  block.classList.add(BLOCK_CLASS)

  const host = block.closest<HTMLElement>('.cp__fenced-code-block, .ui-fenced-code-wrap')
  if (host) {
    host.classList.add('logseq-d2-host')
  }

  const existing = block.querySelector<HTMLElement>(`.${PREVIEW_CLASS}`)
  if (existing) return existing

  const preview = doc.createElement('div')
  preview.className = PREVIEW_CLASS
  block.appendChild(preview)
  return preview
}

function applySvg(preview: HTMLElement, svg: string): void {
  preview.style.minHeight = ''

  preview.innerHTML = `
    <div class="logseq-d2-wrapper">
      <div class="logseq-d2-actions">
        <button class="logseq-d2-btn logseq-d2-copy-btn" type="button" title="Copy SVG vector code to clipboard">
          <span class="d2-btn-icon">${ICONS.copy}</span>
          <span class="d2-btn-label">Copy SVG</span>
        </button>
        <button class="logseq-d2-btn logseq-d2-svg-btn" type="button" title="Download as .svg vector file">
          <span class="d2-btn-icon">${ICONS.download}</span>
          <span class="d2-btn-label">Download SVG</span>
        </button>
        <button class="logseq-d2-btn logseq-d2-png-btn" type="button" title="Download as high-resolution .png image">
          <span class="d2-btn-icon">${ICONS.download}</span>
          <span class="d2-btn-label">Download PNG</span>
        </button>
      </div>
      <div class="logseq-d2-container">
        ${svg}
      </div>
    </div>
  `

  // 绑定复制与下载事件
  const svgEl = preview.querySelector<SVGElement>('.logseq-d2-container svg')
  if (svgEl) {
    const copyBtn = preview.querySelector<HTMLButtonElement>('.logseq-d2-copy-btn')
    copyBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      void copySvgToClipboard(svgEl, copyBtn)
    })

    const svgBtn = preview.querySelector<HTMLButtonElement>('.logseq-d2-svg-btn')
    svgBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      downloadSvgFile(svgEl, 'd2')
    })

    const pngBtn = preview.querySelector<HTMLButtonElement>('.logseq-d2-png-btn')
    pngBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      downloadPngFile(svgEl, 'd2')
    })
  }

  const block = preview.closest<HTMLElement>(BLOCK_SELECTOR) || preview.parentElement
  if (block) {
    const mode = (block.dataset.d2Mode as D2ViewMode) || 'diagram'
    applyViewMode(block, mode)
  }
}

function applyError(preview: HTMLElement, errorText: string): void {
  preview.style.minHeight = ''
  preview.innerHTML = `
    <div class="logseq-d2-wrapper">
      <div class="logseq-d2-error">
        <div class="logseq-d2-error-title">D2 error</div>
        <div>${escapeHtml(errorText)}</div>
      </div>
    </div>
  `
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
  wrap.querySelectorAll(`.${PREVIEW_CLASS}`).forEach((preview) => preview.remove())
  wrap.querySelectorAll(`.${TOOLBAR_CLASS}`).forEach((toolbar) => toolbar.remove())
  wrap.querySelectorAll<HTMLElement>(`.${ACTIONS_CLASS}`).forEach((actions) => {
    actions.classList.remove(ACTIONS_CLASS)
  })
  wrap.querySelectorAll<HTMLElement>(`.${BLOCK_CLASS}`).forEach((block) => {
    block.classList.remove(BLOCK_CLASS)
    delete block.dataset.d2Mode
  })
}

/** Drop the plugin marker from a native action bar we no longer use. */
function releaseActionsHost(actions: HTMLElement | null): void {
  if (!actions || actions.querySelector(`.${TOOLBAR_CLASS}`)) return
  actions.classList.remove(ACTIONS_CLASS)
}

function forgetBlock(block: HTMLElement): void {
  const wasManaged = block.classList.contains(BLOCK_CLASS) || block.hasAttribute('data-d2-source')

  delete block.dataset.d2Source
  delete block.dataset.d2Settings
  delete block.dataset.d2Rendering
  delete block.dataset.d2Mode
  block.classList.remove(BLOCK_CLASS)
  block.querySelector<HTMLElement>(`.${PREVIEW_CLASS}`)?.remove()
  block.querySelector<HTMLElement>(`.${TOOLBAR_CLASS}`)?.remove()

  if (!wasManaged) return

  // The toolbar lives inside Logseq's own action bar (frequently a sibling of
  // the code block), so it has to be released there too — otherwise switching a
  // block from `d2` to another language leaves orphaned buttons in native chrome.
  const actions = findCodeBlockActions(block)
  if (!actions) return
  actions.querySelectorAll<HTMLElement>(`:scope > .${TOOLBAR_CLASS}`).forEach((toolbar) => {
    toolbar.remove()
  })
  releaseActionsHost(actions)
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
  const actionsContainer = findCodeBlockActions(block)
  const isToolbarInPlace = actionsContainer
    ? !!actionsContainer.querySelector(`.${TOOLBAR_CLASS}`)
    : !!block.querySelector(`.${TOOLBAR_CLASS}`)

  // Keep the native action-bar marker in sync even on the skip path, so a React
  // re-render cannot strand our buttons without their scoped styles.
  if (isToolbarInPlace && actionsContainer) {
    actionsContainer.classList.add(ACTIONS_CLASS)
  }

  // Block is already rendered with identical source and settings: skip entirely (zero DOM mutations).
  if (
    (existingPreview &&
      existingPreview.isConnected &&
      isToolbarInPlace &&
      block.dataset.d2Source === source &&
      block.dataset.d2Settings === settingsKey) ||
    block.dataset.d2Rendering === 'true'
  ) {
    return
  }

  ensureToolbar(block, doc)
  const preview = existingPreview ?? ensurePreview(block, doc)
  block.dataset.d2Source = source
  block.dataset.d2Settings = settingsKey

  const cachedSvg = getCachedSvg(source)
  if (cachedSvg) {
    applySvg(preview, cachedSvg)
    return
  }

  if (preview.childElementCount === 0) {
    preview.innerHTML = '<div class="logseq-d2-loading">Rendering diagram…</div>'
  }

  block.dataset.d2Rendering = 'true'
  renderD2(source)
    .then((svg) => {
      delete block.dataset.d2Rendering
      if (!block.isConnected) return
      if (block.dataset.d2Source !== source || block.dataset.d2Settings !== settingsKey) return
      applySvg(preview, svg)
    })
    .catch((error: unknown) => {
      delete block.dataset.d2Rendering
      if (!block.isConnected) return
      if (block.dataset.d2Source !== source || block.dataset.d2Settings !== settingsKey) return
      applyError(preview, describeD2Error(error))
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
  doc.querySelectorAll<HTMLElement>(`[data-d2-source]`).forEach((block) => {
    delete block.dataset.d2Source
    delete block.dataset.d2Settings
  })
  doc.querySelectorAll(`.${PREVIEW_CLASS}`).forEach((preview) => preview.remove())
  doc.querySelectorAll(`.${TOOLBAR_CLASS}`).forEach((toolbar) => toolbar.remove())
  doc.querySelectorAll<HTMLElement>(`.${BLOCK_CLASS}`).forEach((block) => {
    block.classList.remove(BLOCK_CLASS)
    delete block.dataset.d2Mode
  })
  doc.querySelectorAll<HTMLElement>(`.${ACTIONS_CLASS}`).forEach((actions) => {
    actions.classList.remove(ACTIONS_CLASS)
  })
  scan(doc)
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

  // 1. target 本身是否在我们私有 DOM 内部
  if (
    element.closest(`.${PREVIEW_CLASS}`) !== null ||
    element.closest('.logseq-d2-container') !== null ||
    element.closest('.logseq-d2-wrapper') !== null ||
    element.closest('.logseq-d2-actions') !== null ||
    element.closest(`.${TOOLBAR_CLASS}`) !== null ||
    element.closest('.logseq-d2-segmented') !== null
  ) {
    return true
  }

  // 2. 检查新增或删除的节点：如果包含我们自己的 toolbar 或 preview，绝对是自身变动，杜绝死循环！
  const isOwnNode = (n: Node) => {
    if (n.nodeType !== 1) return false
    const el = n as HTMLElement
    return (
      el.classList?.contains(TOOLBAR_CLASS) ||
      el.classList?.contains('logseq-d2-segmented') ||
      el.classList?.contains(PREVIEW_CLASS) ||
      el.classList?.contains('logseq-d2-wrapper') ||
      el.classList?.contains('logseq-d2-container') ||
      el.classList?.contains('logseq-d2-actions')
    )
  }

  if (record.addedNodes.length > 0 && Array.from(record.addedNodes).some(isOwnNode)) {
    return true
  }
  if (record.removedNodes.length > 0 && Array.from(record.removedNodes).some(isOwnNode)) {
    return true
  }

  return false
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

  const removeGlobalEvents = initGlobalEvents(doc)

  // Scroll-anchoring is disabled per element in `D2_STYLES` (only on D2 blocks)
  // rather than on `#main-content-container` / the sidebar: patching the app's
  // scroll containers would change scrolling for every block in Logseq.

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
    removeGlobalEvents()
    observer.disconnect()
    if (timer) clearTimeout(timer)
    if (rafId) defaultWin.cancelAnimationFrame(rafId)

    // Leave Logseq's DOM exactly as we found it: every marker class and data
    // attribute this plugin added is removed here.
    doc
      .querySelectorAll<HTMLElement>(`.${BLOCK_CLASS}, .logseq-d2-host, .${HANDLED_CLASS}, .${ACTIONS_CLASS}`)
      .forEach((element) => {
        element.classList.remove(BLOCK_CLASS, 'logseq-d2-host', HANDLED_CLASS, ACTIONS_CLASS)
      })
    doc.querySelectorAll<HTMLElement>('[data-d2-mode]').forEach((element) => {
      delete element.dataset.d2Mode
    })
    doc.querySelectorAll<HTMLElement>('[data-d2-source]').forEach((block) => {
      delete block.dataset.d2Source
      delete block.dataset.d2Settings
      delete block.dataset.d2Rendering
    })
    doc.querySelectorAll(`.${PREVIEW_CLASS}`).forEach((preview) => preview.remove())
    doc.querySelectorAll(`.${TOOLBAR_CLASS}`).forEach((toolbar) => toolbar.remove())
    doc.getElementById(STYLE_ID)?.remove()
  }
}
