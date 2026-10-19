import '@logseq/libs'
import { LSPluginBaseInfo } from '@logseq/libs/dist/LSPlugin'
import { settingsSchema } from './settings'
import { initDomObserver, refreshAll } from './dom-observer'

function main(_baseInfo: LSPluginBaseInfo) {
  // /d2 slash command: insert a fenced D2 code block template.
  logseq.Editor.registerSlashCommand('d2', async () => {
    await logseq.Editor.insertAtEditingCursor('```d2\n\n```')
  })

  // Re-render all diagrams when settings change (e.g. theme switch).
  try {
    ;(logseq as any).onSettingsChanged?.(() => {
      refreshAll()
    })
  } catch {
    // ignore
  }

  // DOM-observation renderer: works on Logseq DB and classic builds alike.
  // (registerFencedCodeRenderer does not fire on the DB version, so we
  //  observe the top-level document for code blocks instead — same approach
  //  as the logseq-pele plugin.)
  initDomObserver()

  try {
    logseq.UI.showMsg('D2 renderer activated', 'success', { timeout: 2000 })
  } catch {
    // ignore
  }
}

logseq
  .useSettingsSchema(settingsSchema)
  .ready(main)
  .catch((err) => {
    console.error('[logseq-d2] startup error:', err)
  })
