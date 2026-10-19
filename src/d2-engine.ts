import { D2 } from '@terrastruct/d2'
import { getThemeID, getSketch } from './settings'

let d2Instance: D2 | null = null
let d2RecreatePromise: Promise<D2> | null = null
let renderQueue: Promise<void> = Promise.resolve()

function getD2(): D2 {
  if (!d2Instance) {
    d2Instance = new D2()
  }
  return d2Instance
}

// Serialized recreation: when several renders fail at once,
// only one new instance is created and shared by all waiters.
function recreateD2(): Promise<D2> {
  if (!d2RecreatePromise) {
    d2RecreatePromise = new Promise((resolve) => {
      d2Instance = new D2()
      // Give the WASM worker a moment to initialize.
      setTimeout(() => {
        d2RecreatePromise = null
        resolve(d2Instance!)
      }, 100)
    })
  }
  return d2RecreatePromise
}

/** Drop the current WASM instance (e.g. on plugin reload). */
export function resetD2(): void {
  d2Instance = null
  d2RecreatePromise = null
}

/**
 * Compile + render D2 source to an SVG string.
 * Calls are serialized because the WASM worker cannot handle concurrency.
 */
export function renderD2(source: string): Promise<string> {
  const job = renderQueue.then(async () => {
    // Note: the browser WASM build only bundles the dagre layout engine (no ELK).
    const opts = {
      layout: 'dagre' as const,
      sketch: getSketch(),
      themeID: getThemeID(),
      pad: 20,
      scale: 1,
      noXMLTag: true,
    }
    const attempt = async (d2: D2): Promise<string> => {
      const result = await d2.compile(source, { options: opts })
      const svg = await d2.render(result.diagram, result.renderOptions)
      if (typeof svg !== 'string') {
        throw new Error('render returned a non-string value')
      }
      return svg
    }
    try {
      return await attempt(getD2())
    } catch {
      // The instance may be broken; recreate it and retry once.
      return await attempt(await recreateD2())
    }
  })
  // Keep the queue moving even if this job fails.
  renderQueue = job.then(
    () => {},
    () => {}
  )
  return job
}
