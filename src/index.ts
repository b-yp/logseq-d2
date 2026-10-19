import '@logseq/libs'
import { D2 } from '@terrastruct/d2'

// Theme IDs match d2themescatalog (d2themes/d2themescatalog/catalog.go)
const themeMap: Record<string, number> = {
  'Default': 0,
  'Neutral Grey': 1,
  'Flagship Terrastruct': 3,
  'Cool Classics': 4,
  'Mixed Berry Blue': 5,
  'Grape Soda': 6,
  'Aubergine': 7,
  'Colorblind Clear': 8,
  'Vanilla Nitro Cola': 100,
  'Orange Creamsicle': 101,
  'Shirley Temple': 102,
  'Earth Tones': 103,
  'Everglade Green': 104,
  'Buttered Toast': 105,
  'Terminal': 300,
  'Terminal Grayscale': 301,
  'Origami': 302,
  'C4': 303,
  'Dark Mauve': 200,
  'Dark Flagship Terrastruct': 201,
}

let d2Instance: D2 | null = null
let d2RecreatePromise: Promise<D2> | null = null
let renderQueue: Promise<void> = Promise.resolve()

function getThemeID(): number {
  const name = String((logseq.settings as any)?.theme ?? 'Default')
  return themeMap[name] ?? 0
}

function getSketch(): boolean {
  const s = (logseq.settings as any)?.sketch
  return s === true || s === 'true'
}

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

function renderD2(source: string): Promise<string> {
  // The WASM worker cannot handle concurrent calls; serialize all renders.
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

// Logseq passes props in different shapes depending on the context;
// extract the code content defensively.
function extractContent(props: unknown): string {
  if (typeof props === 'string') {
    return props
  }
  if (props && typeof props === 'object') {
    const p = props as any
    if (typeof p.content === 'string') {
      return p.content
    }
    if (p.content && typeof p.content.content === 'string') {
      return p.content.content
    }
  }
  return ''
}

async function main() {
  // Drop the stale WASM worker left by a previous plugin load.
  d2Instance = null

  logseq.useSettingsSchema([
    {
      key: 'theme',
      type: 'enum',
      title: 'Theme',
      description: 'Color theme for rendered diagrams.',
      default: 'Default',
      enumChoices: Object.keys(themeMap),
    },
    {
      key: 'sketch',
      type: 'boolean',
      title: 'Sketch mode',
      description: 'Render diagrams in hand-drawn sketch style.',
      default: false,
    },
  ] as any)

  logseq.Editor.registerSlashCommand('d2', async () => {
    await logseq.Editor.insertAtEditingCursor('```d2\n\n```')
  })

  const React = (logseq.Experiments as any).React

  ;(logseq.Experiments as any).registerFencedCodeRenderer('d2', {
    render: (props: unknown) => {
      const content = extractContent(props)
      const elRef = React.useRef(null)

      React.useEffect(() => {
        const el: HTMLDivElement | null = elRef.current
        if (!el) {
          return
        }
        if (!content.trim()) {
          el.textContent = 'Empty D2 diagram'
          return
        }
        let cancelled = false
        el.textContent = 'Rendering D2 diagram…'
        el.style.color = ''

        renderD2(content)
          .then((svg) => {
            if (cancelled) {
              return
            }
            el.innerHTML = svg
          })
          .catch((err: any) => {
            if (cancelled) {
              return
            }
            el.textContent = `D2 render failed: ${err?.message || String(err)}`
            el.style.color = '#c0392b'
            el.style.fontFamily = 'monospace'
            el.style.whiteSpace = 'pre-wrap'
          })

        return () => {
          cancelled = true
        }
      }, [content])

      return React.createElement('div', {
        ref: elRef,
        className: 'logseq-d2',
      })
    },
  })

  console.log('[logseq-d2] loaded (wasm renderer)')
}

logseq.ready(main).catch(console.error)
