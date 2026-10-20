/*
 * Injected once into the host document by `renderer.injectStyles()`.
 *
 * 侵入性约定（修改前请先读）
 * ---------------------------------------------------------------------------
 * 1. 只给「插件自建的元素」和「插件自己加上去的 class」写样式。
 *    任何落到 Logseq 原生节点上的规则，都必须挂在插件自管的标记 class 之后：
 *    `.logseq-d2-block`、`.logseq-d2-code-actions`、`.logseq-d2-fenced`。
 *    这三个 class 由 renderer 添加，并在重渲染 / 卸载时移除。
 * 2. `!important` 只用于「覆盖 Logseq 对同一个原生元素已有的声明」
 *    （例如代码块自身的 display / position / 模式显隐）。
 *    插件自有 class 一律靠选择器优先级取胜，不允许用 `!important` 抢。
 * 3. 不写全局 reset，不选中 body / html / *，不改动应用级滚动容器。
 */
export const D2_STYLES = `
/* 防止图表挂载与重绘时引起页面滚动位置异常跳动。
   仅作用于插件自己的节点，以及被插件标记过的宿主代码块；
   这里保留 !important，是为了压过宿主可能设置的 overflow-anchor。 */
.extensions__code.logseq-d2-block,
.ui-fenced-code-wrap.logseq-d2-fenced,
.ui-fenced-code-wrap:has(.logseq-d2-container),
.cp__fenced-code-block:has(.logseq-d2-container),
.logseq-d2-block,
.logseq-d2-preview,
.logseq-d2-wrapper,
.logseq-d2-container,
.logseq-d2-host,
.logseq-d2-loading {
  overflow-anchor: none !important;
}

/* 仅针对标记为 logseq-d2-block 的 D2 代码块调整上下流式排版 */
.extensions__code.logseq-d2-block {
  position: relative;
  display: flex !important;
  flex-direction: column !important;
  align-items: stretch !important;
  width: 100% !important;
}

.extensions__code.logseq-d2-block .code-editor {
  width: 100%;
  flex: 1 1 100%;
}

/* 原生代码块操作栏：只对插件「认领」过的操作栏生效。
   .logseq-d2-code-actions 由 renderer 在把切换按钮插进去时添加，
   并在块不再渲染 / 插件卸载时移除，因此其它语言的代码块完全不受影响。 */
.code-block-actions.logseq-d2-code-actions {
  display: inline-flex !important;
  align-items: center !important;
  flex-direction: row !important;
  flex-wrap: nowrap !important;
  width: auto !important;
  max-width: none !important;
  gap: 2px !important;
  z-index: 10 !important;
}

/* 同一个被认领的操作栏内的子元素：回归 flex 文档流，平起平坐，
   避免原生子元素（语言下拉、复制按钮）与插件按钮互相叠压。 */
.code-block-actions.logseq-d2-code-actions > * {
  position: static !important;
  float: none !important;
  top: auto !important;
  bottom: auto !important;
  left: auto !important;
  right: auto !important;
  margin: 0 !important;
}

/* 模式切换栏：插件自有元素。
   双 class 选择器只是为了稳压操作栏里可能存在的原生子元素规则，
   仍然不使用 !important。 */
.logseq-d2-toolbar.logseq-d2-segmented {
  display: inline-flex;
  align-items: center;
  padding: 0;
  margin: 0;
  gap: 2px;
  background: transparent;
  border: none;
  box-shadow: none;
  user-select: none;
  vertical-align: middle;
  flex-shrink: 0;
  position: static;
}

/* 兜底：完全找不到原生操作栏时，浮动工具栏贴右下角，
   避开 Logseq 右上角的原生按钮区，绝不再叠在它们上面。 */
.logseq-d2-segmented.d2-toolbar-floating {
  position: absolute;
  top: auto;
  bottom: 4px;
  right: 8px;
  z-index: 5;
  background: transparent;
  border: none;
  box-shadow: none;
}

/* 切换项按钮：插件自有元素，作用域挂在插件自有的 .logseq-d2-segmented 上，
   不依赖宿主 DOM 结构，也不需要 !important。 */
.logseq-d2-segmented .d2-seg-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 20px;
  line-height: 20px;
  padding: 0 4px;
  font-size: 11px;
  font-family: inherit;
  color: var(--ls-secondary-text-color, #94a3b8);
  background: transparent;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  transition: color 0.15s ease, background-color 0.15s ease, opacity 0.15s ease;
  white-space: nowrap;
  user-select: none;
  box-sizing: border-box;
  opacity: 0.75;
}

.logseq-d2-segmented .d2-seg-btn:hover {
  color: var(--ls-primary-text-color, #ffffff);
  background-color: var(--ls-tertiary-background-color, rgba(127, 127, 127, 0.15));
  opacity: 1;
}

.logseq-d2-segmented .d2-seg-btn.active {
  color: var(--ls-link-text-color, #38bdf8);
  background-color: rgba(56, 189, 248, 0.12);
  font-weight: 500;
  opacity: 1;
}

.logseq-d2-segmented .d2-seg-btn .d2-seg-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
}

.logseq-d2-segmented .d2-seg-btn .d2-seg-icon svg {
  display: block;
  width: 12px;
  height: 12px;
}

/* 与原生语言/复制按钮之间的细竖线分隔符 */
.d2-seg-divider {
  display: inline-block;
  width: 1px;
  height: 10px;
  margin: 0 4px 0 2px;
  background-color: currentColor;
  opacity: 0.25;
  flex-shrink: 0;
}

/* 隐藏本插件 D2 代码块里的底层 textarea，避免与 CodeMirror 输入域重叠。
   只影响被标记的 D2 块，其它语言的代码块保持原生行为。 */
.logseq-d2-block textarea[data-lang],
.logseq-d2-block .code-editor > textarea[data-lang] {
  display: none;
}

/* 状态控制：纯图表模式（Diagram）—— 仅隐藏当前 D2 代码块内的编辑器主体代码，保留右上角原生操作按钮。
   这里的 !important 用于压过 CodeMirror / 原生编辑器自己写在元素上的 display。 */
.extensions__code.logseq-d2-block[data-d2-mode="diagram"] .CodeMirror,
.extensions__code.logseq-d2-block[data-d2-mode="diagram"] .cm-editor,
.extensions__code.logseq-d2-block[data-d2-mode="diagram"] pre code {
  display: none !important;
}

/* 纯图表模式：编辑器主体已隐藏，容器不再保留任何占位高度 */
.extensions__code.logseq-d2-block[data-d2-mode="diagram"] .code-editor {
  min-height: 0 !important;
  padding-top: 0 !important;
}

/* 收紧「代码块 → 图表卡片 → 块底部」的垂直留白。
   只在图表卡片可见时（diagram / both）生效，code 模式完全保持原生排版。
   注意：编辑器区域同时是右上角原生操作栏（绝对定位）的落脚点，
   所以这里只收「多余」的空白，不把编辑器本身压扁，否则两层按钮会叠在一起。 */
.extensions__code.logseq-d2-block:not([data-d2-mode="code"]) {
  padding-bottom: 0 !important;
  gap: 0 !important;
  row-gap: 0 !important;
}

/* 编辑器别用 flex-grow 吃掉容器的富余高度（那会变成代码与卡片之间的空带），
   但保留它自己的内外边距。 */
.extensions__code.logseq-d2-block:not([data-d2-mode="code"]) .code-editor {
  flex: 0 0 auto !important;
}

/* 卡片与上方内容之间保留一点呼吸位 */
.extensions__code.logseq-d2-block:not([data-d2-mode="code"]) .logseq-d2-wrapper {
  margin-top: 4px;
}

/* 纯图表模式：代码主体隐藏后，块顶部没有东西托住右上角的操作栏，
   这里显式留出一条与操作栏等高的空间，避免按钮直接压在卡片上。 */
.extensions__code.logseq-d2-block[data-d2-mode="diagram"] {
  padding-top: 28px !important;
}

/* 预览层只是挂载点（plugin 自己 div 包住 .logseq-d2-wrapper），
   让它不产生任何盒子：原生样式/内联样式无论给它写什么 min-height、
   flex 拉伸、padding，都不会在图表上下多出一截。 */
.extensions__code.logseq-d2-block:not([data-d2-mode="code"]) .logseq-d2-preview {
  display: contents !important;
  margin: 0 !important;
  padding: 0 !important;
}

/* 状态控制：纯代码模式（Code）—— 仅隐藏当前 D2 代码块内的图表卡片 */
.extensions__code.logseq-d2-block[data-d2-mode="code"] .logseq-d2-preview {
  display: none !important;
}

.extensions__code.logseq-d2-block[data-d2-mode="code"] .CodeMirror,
.extensions__code.logseq-d2-block[data-d2-mode="code"] .cm-editor,
.extensions__code.logseq-d2-block[data-d2-mode="code"] pre code {
  display: block !important;
}

/* 状态控制：同时显示（Both）—— 编辑器和图表卡片并存
   （.logseq-d2-preview 用 display: contents，不参与这里的显隐控制） */
.extensions__code.logseq-d2-block[data-d2-mode="both"] .CodeMirror,
.extensions__code.logseq-d2-block[data-d2-mode="both"] .cm-editor,
.extensions__code.logseq-d2-block[data-d2-mode="both"] pre code {
  display: block !important;
}

/* 图表预览卡片：缩减与上方代码块及按钮行的垂直留白 */
.logseq-d2-preview {
  width: 100%;
  margin-top: 4px;
  box-sizing: border-box;
}

.logseq-d2-wrapper {
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.logseq-d2-container {
  position: relative;
  width: 100%;
  min-height: 40px;
  max-width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.2));
  border-radius: 8px;
  background-color: var(--ls-secondary-background-color, rgba(127, 127, 127, 0.08));
  overflow-x: auto;
  overflow-y: hidden;
  transition: border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
}

.logseq-d2-container:hover {
  border-color: var(--ls-link-text-color, rgba(59, 130, 246, 0.4));
}

/* 图表已经接管块内容后，去掉原生 fenced 代码块的外框，避免出现"框中框"。
   仅作用于插件标记过的 .logseq-d2-fenced 块。 */
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

/* 图表右上角浮动导出栏（完全限定在 logseq-d2 内部） */
.logseq-d2-actions {
  position: absolute;
  top: 4px;
  right: 6px;
  display: flex;
  align-items: center;
  gap: 5px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 5;
}

.logseq-d2-wrapper:hover .logseq-d2-actions,
.logseq-d2-preview:hover .logseq-d2-actions,
.ui-fenced-code-wrap:hover .logseq-d2-actions {
  opacity: 1;
  pointer-events: auto;
}

.logseq-d2-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  font-size: 11px;
  font-family: var(--ls-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif);
  line-height: 1.4;
  color: var(--ls-secondary-text-color, #94a3b8);
  background-color: var(--ls-tertiary-background-color, rgba(127, 127, 127, 0.12));
  border: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.2));
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease-in-out;
  user-select: none;
  white-space: nowrap;
}

.logseq-d2-btn:hover {
  color: var(--ls-primary-text-color, #ffffff);
  background-color: var(--ls-quaternary-background-color, rgba(127, 127, 127, 0.25));
  border-color: var(--ls-link-text-color, #3b82f6);
}

.logseq-d2-btn:active {
  transform: scale(0.96);
}

.logseq-d2-btn .d2-btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 13px;
  height: 13px;
  opacity: 0.85;
}

.logseq-d2-btn .d2-btn-icon svg {
  display: block;
  width: 13px;
  height: 13px;
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
