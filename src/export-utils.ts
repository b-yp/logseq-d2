/**
 * 图表导出与复制辅助工具 (参考 logseq-pele)
 */

export function getExportableSvg(svgEl: SVGElement): string {
  const clone = svgEl.cloneNode(true) as SVGElement
  const comp = window.getComputedStyle(svgEl)

  // 确保命名空间
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }

  // 确保导出时包含基础字体与继承设置
  const existingStyle = clone.getAttribute('style') || ''
  const extraStyles: string[] = []

  const color = comp.getPropertyValue('color').trim()
  if (color) {
    extraStyles.push(`color:${color}`)
  }
  const fontFamily = comp.getPropertyValue('font-family').trim()
  if (fontFamily) {
    extraStyles.push(`font-family:${fontFamily}`)
  }

  if (extraStyles.length > 0) {
    clone.setAttribute('style', `${existingStyle};${extraStyles.join(';')}`)
  }

  return clone.outerHTML
}

export async function copySvgToClipboard(svgEl: SVGElement, btnEl?: HTMLElement): Promise<boolean> {
  const svgText = getExportableSvg(svgEl)
  const doc = svgEl.ownerDocument || document
  const win = doc.defaultView || window

  let success = false

  // 1. 尝试宿主环境的 navigator.clipboard
  try {
    if (win.navigator?.clipboard?.writeText) {
      await win.navigator.clipboard.writeText(svgText)
      success = true
    }
  } catch {
    // fallback
  }

  // 2. 降级方案：使用具有焦点的 textarea 与 execCommand('copy')
  if (!success) {
    try {
      const textarea = doc.createElement('textarea')
      textarea.value = svgText
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      textarea.style.top = '-9999px'
      textarea.style.opacity = '0'
      doc.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      success = doc.execCommand('copy')
      doc.body.removeChild(textarea)
    } catch (e) {
      console.error('[logseq-d2] Fallback execCommand copy failed:', e)
    }
  }

  if (success && btnEl) {
    const label = btnEl.querySelector('.d2-btn-label')
    const icon = btnEl.querySelector('.d2-btn-icon')
    if (label && icon) {
      const originalText = label.textContent
      const originalIcon = icon.innerHTML
      label.textContent = 'Copied!'
      icon.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
      setTimeout(() => {
        label.textContent = originalText
        icon.innerHTML = originalIcon
      }, 1500)
    }
  }

  return success
}

export function downloadSvgFile(svgEl: SVGElement, filenamePrefix = 'd2-diagram'): void {
  const svgText = getExportableSvg(svgEl)
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filenamePrefix}-${Date.now()}.svg`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function downloadPngFile(svgEl: SVGElement, filenamePrefix = 'd2-diagram'): void {
  const svgText = getExportableSvg(svgEl)
  const svgNode = svgEl as SVGSVGElement
  const width =
    parseFloat(svgEl.getAttribute('width') || '') ||
    svgNode.viewBox?.baseVal?.width ||
    svgEl.clientWidth ||
    800
  const height =
    parseFloat(svgEl.getAttribute('height') || '') ||
    svgNode.viewBox?.baseVal?.height ||
    svgEl.clientHeight ||
    600
  const scale = 2 // 2倍高清视网膜渲染

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // 探测背景底色（避免深色主题或透明背景导出的图片在外部显示异常）
  const comp = window.getComputedStyle(svgEl)
  const container = svgEl.closest('.logseq-d2-container') as HTMLElement | null
  const containerComp = container ? window.getComputedStyle(container) : null
  const bg =
    containerComp?.getPropertyValue('--ls-primary-background-color').trim() ||
    containerComp?.getPropertyValue('background-color').trim() ||
    comp.getPropertyValue('background-color').trim()

  if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)
  const img = new Image()

  img.onload = () => {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    URL.revokeObjectURL(url)
    canvas.toBlob((blob) => {
      if (!blob) return
      const pngUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = pngUrl
      a.download = `${filenamePrefix}-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(pngUrl)
    }, 'image/png')
  }
  img.src = url
}
