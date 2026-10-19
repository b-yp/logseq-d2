import '@logseq/libs'
import { LSPluginBaseInfo } from '@logseq/libs/dist/LSPlugin'
import { settingsSchema } from './settings'
import { initDomObserver, refreshAll } from './dom-observer'
import { refreshDebugOverlay } from './debug'

function toast(msg: string, status: 'success' | 'error' = 'success') {
  try {
    logseq.UI.showMsg(msg, status, { timeout: 2500 })
  } catch {
    // ignore
  }
}

function main(_baseInfo: LSPluginBaseInfo) {
  // First visible sign of life: if this toast never shows, the plugin
  // itself failed to load (not a rendering problem).
  toast('logseq-d2: starting…')

  try {
    // /d2 slash command: insert a fenced D2 code block template.
    try {
      logseq.Editor.registerSlashCommand('d2', async () => {
        await logseq.Editor.insertAtEditingCursor('```d2\n\n```')
      })
    } catch (err: any) {
      // Slash commands may not exist on all Logseq versions; not fatal.
      console.warn('[logseq-d2] slash command unavailable:', err?.message || err)
    }

    // Re-render all diagrams when settings change (e.g. theme switch).
    try {
      ;(logseq as any).onSettingsChanged?.(() => {
        refreshAll()
        refreshDebugOverlay()
      })
    } catch {
      // ignore
    }

    // DOM-observation renderer: works on Logseq DB and classic builds alike.
    // (registerFencedCodeRenderer does not fire on the DB version, so we
    //  observe the top-level document for code blocks instead — same approach
    //  as the logseq-pele plugin.)
    initDomObserver()

    toast('D2 renderer activated')
  } catch (err: any) {
    const msg = err?.message || String(err)
    console.error('[logseq-d2] startup failed:', err)
    toast(`logseq-d2 failed to start: ${msg}`, 'error')
  }
}

logseq
  .useSettingsSchema(settingsSchema)
  .ready(main)
  .catch((err) => {
    console.error('[logseq-d2] startup error:', err)
  })
