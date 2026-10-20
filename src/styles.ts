export const D2_STYLES = `
/* Suppress browser scroll-anchoring jumps when diagrams mount or resize above the viewport */
.logseq-d2-block,
.logseq-d2-preview,
.logseq-d2-container,
.logseq-d2-host,
.logseq-d2-loading,
.ui-fenced-code-wrap.logseq-d2-fenced,
.ui-fenced-code-wrap:has(.logseq-d2-container),
.cp__fenced-code-block:has(.logseq-d2-container) {
  overflow-anchor: none !important;
}

/* Stack the preview under the code editor instead of beside it (for DOM fallback). */
.extensions__code.logseq-d2-block {
  display: flex !important;
  flex-direction: column !important;
  align-items: stretch !important;
  width: 100% !important;
}

.extensions__code.logseq-d2-block .code-editor {
  width: 100% !important;
  flex: 1 1 100% !important;
}

.logseq-d2-preview {
  width: 100%;
  margin-top: 8px;
  box-sizing: border-box;
  contain: layout paint;
}

.logseq-d2-container {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  padding: 16px;
  border: 1px solid rgba(127, 127, 127, 0.2);
  border-radius: 8px;
  background-color: rgba(127, 127, 127, 0.08);
  overflow-x: auto;
  overflow-y: hidden;
}

/* The host wrapper sometimes paints a light canvas behind fenced renderers. */
.logseq-d2-host,
.ui-fenced-code-wrap.logseq-d2-fenced,
.ui-fenced-code-wrap.logseq-d2-fenced .ui-fenced-code-result {
  border-color: transparent !important;
  background-color: transparent !important;
}

.logseq-d2-container svg {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}

.logseq-d2-loading {
  padding: 10px 14px;
  color: var(--ls-secondary-text-color, #888888);
  font-size: 13px;
  border-radius: 6px;
  background-color: rgba(127, 127, 127, 0.04);
}

.logseq-d2-error {
  padding: 12px 16px;
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 6px;
  background-color: rgba(239, 68, 68, 0.08);
  color: var(--ls-error-text-color, #ef4444);
  font-family: var(--ls-font-mono, monospace);
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.logseq-d2-error-title {
  margin-bottom: 4px;
  font-weight: 600;
}
`
