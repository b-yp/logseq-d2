import '@logseq/libs'

/**
 * main entry
 */
async function main() {
  logseq.Editor.registerSlashCommand('d2', async () => {

    await logseq.Editor.insertAtEditingCursor(`{{renderer :d2_render}}`)

    const currentBlock = await logseq.Editor.getCurrentBlock()

    if (!currentBlock) {
      return
    }

    await logseq.Editor.insertBlock(
      currentBlock.uuid,
      '```d2\n```'
    )
  })

  logseq.provideStyle(`
    .d2-wrapper {
      position: relative;
      display: flex;
    }

    .d2-wrapper > .edit-button {
      position: absolute;
      top: 10px;
      right: 10px;
    }
  `)

  logseq.App.onMacroRendererSlotted(async ({ slot, payload }) => {

    const [type] = payload.arguments
    if (type !== ':d2_render') {
      return
    }

    // TODO: 如果只是块折叠，直接 return

    const blockDetail = await logseq.Editor.getBlock(payload.uuid, { includeChildren: true })
    console.log('blockDetail', blockDetail)
    const content = blockDetail?.children?.[0]?.content
    const contentUuid = blockDetail?.children?.[0]?.uuid

    if (!content) {
      return
    }

    const d2Data = content.slice(6, -4)

    logseq.provideUI({
      key: 'd2',
      slot,
      template: `加载中...`,
    })

    /**
     * 当开始加载图标的时候折叠代码块
     * 为什么不能在接口请求完成之后折叠
     * 因为折叠也会触发加载
     */
    // logseq.Editor.setBlockCollapsed(payload.uuid, true)

    // TODO: 后期优化，当两次请求数据相同时不重新加载
    const response = await fetch('https://d2api.fly.dev/getSvg', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf-8;'
      },
      body: JSON.stringify({ diagramCode: d2Data }),
    })

    const svgCode = await response.text()

    logseq.provideModel({
      edit() {
        if (!contentUuid) {
          return
        }

        console.log('uuid', contentUuid)
        logseq.Editor.editBlock(contentUuid)
        // logseq.Editor.setBlockCollapsed(payload.uuid, false)
      }
    })

    logseq.provideUI({
      key: 'd2',
      slot,
      template: `
        <div class="d2-wrapper">
          <button
            class="edit-button"
            data-on-click="edit"
          >编辑</button>
          ${svgCode}
        </div>
      `,
    })
  })
}

// bootstrap
logseq.ready(main).catch(console.error)
