import { D2, type RenderOptions as D2RenderOptions } from '@terrastruct/d2'
import { getRenderOptions, type RenderOptions } from './settings'

const CACHE_LIMIT = 200

const cache = new Map<string, string>()
const heightCache = new Map<string, number>()

let engine: D2 | null = null
let queue: Promise<unknown> = Promise.resolve()

function cacheKey(source: string, options: RenderOptions): string {
  return `${options.themeID}:${options.sketch}:${options.transparentBackground}:${options.scale}:${source}`
}

export function extractSvgHeight(svg: string): number | null {
  const openTag = svg.slice(0, Math.min(svg.indexOf('>') + 1, 1000))
  const heightMatch = /\bheight="([\d.]+)(px)?"/.exec(openTag)
  if (heightMatch) {
    const h = Number.parseFloat(heightMatch[1])
    if (Number.isFinite(h) && h > 0) return h
  }
  const vbMatch = /\bviewBox="[\d.-]+\s+[\d.-]+\s+[\d.-]+\s+([\d.]+)"/.exec(openTag)
  if (vbMatch) {
    const h = Number.parseFloat(vbMatch[1])
    if (Number.isFinite(h) && h > 0) return h
  }
  return null
}

/**
 * D2's JS wrapper handles one message at a time, so every render goes through
 * a single promise chain. Compile options only affect the diagram; appearance
 * options have to be passed to render().
 */
async function compileAndRender(source: string, appearance: RenderOptions): Promise<string> {
  const d2 = (engine ??= new D2())
  const { diagram, renderOptions } = await d2.compile(source, { options: { layout: 'dagre' } })

  const renderConfig: D2RenderOptions & { themeOverrides?: Record<string, string> } = {
    ...renderOptions,
    themeID: appearance.themeID,
    sketch: appearance.sketch,
    pad: 20,
    scale: appearance.scale,
    noXMLTag: true,
  }

  if (appearance.transparentBackground) {
    // N7 is D2's canvas background. Let the Logseq card provide the surface
    // instead of stretching a white rectangle behind every diagram.
    renderConfig.themeOverrides = { N7: '#00000000' }
  }

  return d2.render(diagram, renderConfig)
}

export function getCachedSvg(source: string): string | undefined {
  return cache.get(cacheKey(source, getRenderOptions()))
}

export function getCachedHeight(source: string): number | undefined {
  return heightCache.get(cacheKey(source, getRenderOptions()))
}

export function renderD2(source: string): Promise<string> {
  const options = getRenderOptions()
  const key = cacheKey(source, options)

  const cached = cache.get(key)
  if (cached) return Promise.resolve(cached)

  const job = queue.then(async () => {
    // Another block with the same source may have filled the cache while queued.
    const hit = cache.get(key)
    if (hit) return hit

    const svg = await compileAndRender(source, options)
    cache.set(key, svg)
    const height = extractSvgHeight(svg)
    if (height) {
      heightCache.set(key, height)
    }

    if (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next()
      if (!oldest.done) {
        cache.delete(oldest.value)
        heightCache.delete(oldest.value)
      }
    }
    return svg
  })

  // Keep the queue alive even when this render fails.
  queue = job.catch(() => undefined)
  return job
}

export function disposeEngine(): void {
  const instance = engine as unknown as { worker?: Worker } | null
  engine = null
  cache.clear()
  heightCache.clear()
  try {
    instance?.worker?.terminate()
  } catch {
    // The worker may already be gone.
  }
}
