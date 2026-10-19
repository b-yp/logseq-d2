// Injected into the top-level Logseq document (not the plugin iframe).
export const D2_STYLES = `
.logseq-d2-preview {
  margin-top: 8px;
}
.logseq-d2-preview .logseq-d2-loading {
  color: var(--ls-secondary-text-color, #888);
  font-size: 13px;
  padding: 4px 0;
}
.logseq-d2-preview .logseq-d2-container {
  overflow-x: auto;
}
.logseq-d2-preview .logseq-d2-container svg {
  max-width: 100%;
  height: auto;
}
.logseq-d2-preview .logseq-d2-error {
  color: #c0392b;
  font-family: monospace;
  font-size: 13px;
  white-space: pre-wrap;
  padding: 4px 0;
}
`
