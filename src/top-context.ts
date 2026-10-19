// Access to the top-level Logseq document.
// The plugin runs inside an iframe; on Logseq desktop the iframe is same-origin
// with the main window, so window.top.document is reachable.
export function getTopContext(): { doc: Document; win: any } {
  try {
    if (typeof window !== 'undefined' && window.top && window.top.document) {
      return { doc: window.top.document, win: window.top }
    }
  } catch {
    // cross-origin: fall back to the iframe's own document
  }
  return { doc: document, win: window }
}

export function topLog(...args: unknown[]) {
  try {
    getTopContext().win.console.log('[logseq-d2]', ...args)
  } catch {
    // ignore
  }
}
