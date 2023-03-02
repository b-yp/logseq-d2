import '@logseq/libs'
import { LSPluginBaseInfo, SettingSchemaDesc } from '@logseq/libs/dist/LSPlugin'

import D2Renderer from './D2Renderer'

const settingsSchema: Array<SettingSchemaDesc> = [
  {
    key: 'd2',
    type: 'boolean',
    title: 'Support d2?',
    description: 'Use D2 to render the chart.',
    default: true
  }
]

/**
 * main entry
 */
async function main(baseInfo: LSPluginBaseInfo) {
  const { settings } = baseInfo

  console.log('settings', settings, settings.d2)

  if (settings.d2) {
    logseq.Experiments.registerFencedCodeRenderer('d2', {
      edit: true,
      render: D2Renderer,
    })
  }
}

// bootstrap
logseq.useSettingsSchema(settingsSchema).ready(main).catch(console.error)
