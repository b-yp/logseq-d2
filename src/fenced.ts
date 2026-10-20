import { getCachedHeight, getCachedSvg, renderD2 } from './engine'
import { describeD2Error } from './errors'
import { markBlockHandled } from './renderer'
import { getSettingsKey, invalidateThemeModeCache } from './settings'

interface HostReact {
  createElement: (
    type: unknown,
    props?: Record<string, unknown> | null,
    ...children: unknown[]
  ) => unknown
  useState: <T>(initial: T | (() => T)) => [T, (value: T) => void]
  useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => void
}

interface ExperimentsApi {
  React?: HostReact
  registerFencedCodeRenderer?: (
    type: string,
    options: {
      edit?: boolean
      render: (props: { content: string }) => unknown
    },
  ) => unknown
}

/**
 * Renders inside Logseq's fenced-code React tree. Logseq hides the source
 * editor in preview mode, so the block height is the diagram itself.
 */
function createD2View(React: HostReact) {
  return function D2View({ content }: { content: string }): unknown {
    const source = content.trim()
    const [svg, setSvg] = React.useState(() => getCachedSvg(source) ?? '')
    const [error, setError] = React.useState('')
    const [settingsKey, setSettingsKey] = React.useState(getSettingsKey)

    // Cache hits are available during render, so a remounted block has its
    // final SVG before paint.
    const renderedSvg = getCachedSvg(source) ?? svg
    const cachedHeight = getCachedHeight(source)

    const baseStyle: Record<string, string> = {
      overflowAnchor: 'none',
    }
    if (cachedHeight) {
      baseStyle.minHeight = `${cachedHeight}px`
    }

    const markHandled = (node: HTMLElement | null) => markBlockHandled(node)

    React.useEffect(() => {
      let offSettings: (() => void) | undefined
      let offTheme: (() => void) | undefined
      const refresh = () => setSettingsKey(getSettingsKey())

      try {
        offSettings = logseq.onSettingsChanged(refresh)
      } catch {
        // Settings changes still apply the next time the block mounts.
      }

      try {
        offTheme = logseq.App.onThemeModeChanged(() => {
          invalidateThemeModeCache()
          setTimeout(refresh, 0)
        })
      } catch {
        // Older builds may not expose theme-mode events.
      }

      return () => {
        offSettings?.()
        offTheme?.()
      }
    }, [])

    React.useEffect(() => {
      const nextSource = content.trim()
      if (!nextSource) {
        setSvg('')
        setError('')
        return
      }

      const cached = getCachedSvg(nextSource)
      if (cached) {
        setSvg(cached)
        setError('')
        return
      }

      let cancelled = false
      setError('')

      // If this is the initial load without cache, render immediately to avoid delay.
      // If svg already exists, this is user typing/editing, so debounce to avoid lag.
      const delay = svg ? 250 : 0

      const doRender = () => {
        renderD2(nextSource)
          .then((next) => {
            if (!cancelled) setSvg(next)
          })
          .catch((reason: unknown) => {
            if (!cancelled) setError(describeD2Error(reason))
          })
      }

      if (delay === 0) {
        doRender()
        return () => {
          cancelled = true
        }
      }

      const timer = setTimeout(doRender, delay)
      return () => {
        cancelled = true
        clearTimeout(timer)
      }
    }, [content, settingsKey])

    if (!source) return null

    if (error) {
      return React.createElement(
        'div',
        { className: 'logseq-d2-error', ref: markHandled, style: { overflowAnchor: 'none' } },
        React.createElement('div', { className: 'logseq-d2-error-title' }, 'D2 error'),
        React.createElement('div', null, error),
      )
    }

    if (renderedSvg) {
      return React.createElement('div', {
        className: 'logseq-d2-container',
        ref: markHandled,
        style: baseStyle,
        dangerouslySetInnerHTML: { __html: renderedSvg },
      })
    }

    return React.createElement(
      'div',
      {
        className: 'logseq-d2-loading',
        ref: markHandled,
        style: baseStyle,
      },
      'Rendering diagram…',
    )
  }
}

export function registerD2FencedRenderer(): boolean {
  const experiments = (logseq as unknown as { Experiments?: ExperimentsApi }).Experiments
  if (!experiments?.React || !experiments.registerFencedCodeRenderer) return false

  try {
    const register = experiments.registerFencedCodeRenderer.bind(experiments)
    register('d2', { edit: false, render: createD2View(experiments.React) })
    return true
  } catch (error) {
    console.error('[logseq-d2] failed to register fenced renderer', error)
    return false
  }
}
