import '@logseq/libs'
import { BUILD_TIME, BUILD_VERSION } from './build-info'
import { disposeEngine } from './engine'
import { registerD2FencedRenderer } from './fenced'
import { renderAll, startRenderer } from './renderer'
import { invalidateThemeModeCache, setKnownThemeMode, settingsSchema } from './settings'

function printBuildInfo(): void {
  const infoText = `[logseq-d2] Loaded v${BUILD_VERSION} (Built at: ${BUILD_TIME})`
  const style = 'color: #059669; font-weight: bold; font-size: 12px;'

  console.info(`%c${infoText}`, style)

  try {
    const topWin = window.top as any
    if (topWin && topWin !== window && topWin.console?.info) {
      topWin.console.info(`%c${infoText}`, style)
    }
  } catch {
    // Cross-origin context: fallback silently
  }

  try {
    // Only the plugin's own iframe is written to. The host page belongs to
    // Logseq, so its globals are left untouched.
    const meta = { version: BUILD_VERSION, builtAt: BUILD_TIME }
    ;(window as unknown as Record<string, unknown>).__LOGSEQ_D2_BUILD__ = meta
  } catch {
    // ignore
  }
}

async function initThemeListener(): Promise<void> {
  try {
    const configs = (await logseq.App.getUserConfigs()) as
      | { preferredThemeMode?: 'dark' | 'light' }
      | undefined
    if (configs?.preferredThemeMode) {
      setKnownThemeMode(configs.preferredThemeMode)
    }
  } catch {
    // Older builds or fallback
  }

  try {
    logseq.App.onThemeModeChanged((param: unknown) => {
      const mode = typeof param === 'string' ? param : (param as { mode?: string })?.mode
      if (mode === 'dark' || mode === 'light') {
        setKnownThemeMode(mode)
      } else {
        invalidateThemeModeCache()
      }
      setTimeout(() => renderAll(), 0)
    })
  } catch {
    // Older builds may not expose theme-mode events.
  }
}

function main() {
  printBuildInfo()
  void initThemeListener()

  // Classic Logseq renders through the official fenced-code renderer. The DOM
  // observer still starts for builds where that renderer never mounts (DB).
  registerD2FencedRenderer()
  const stopRenderer = startRenderer()

  logseq.onSettingsChanged(() => renderAll())

  // Dev convenience: reload the plugin iframe without restarting Logseq.
  try {
    logseq.App.registerCommandPalette(
      { key: 'logseq-d2-reload', label: 'D2: Reload plugin' },
      () => {
        try {
          const url = new URL(window.location.href)
          url.searchParams.set('d2-reload', Date.now().toString())
          window.location.replace(url.toString())
        } catch {
          window.location.reload()
        }
      },
    )
  } catch {
    // Command palette is unavailable on some builds.
  }

  logseq.Editor.registerSlashCommand('d2', async () => {
    await logseq.Editor.insertAtEditingCursor('```d2\ndirection: right\nx -> y: hello\n```')
  })

  logseq.beforeunload(async () => {
    stopRenderer()
    disposeEngine()
  })
}

logseq
  .useSettingsSchema(settingsSchema)
  .ready(main)
  .catch((error) => console.error('[logseq-d2] failed to start', error))
