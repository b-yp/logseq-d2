import '@logseq/libs'

import { genRandomStr } from './utils'

/**
 * main entry
 */
async function main() {
  logseq.Editor.registerSlashCommand('d2', async () => {

    await logseq.Editor.insertAtEditingCursor(`{{renderer :d2_lang_${genRandomStr()}}}`)

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
    const [type, width, height] = payload.arguments
    if (!type?.startsWith(':d2_lang')) {
      return
    }

    const currentBlock = await logseq.Editor.getCurrentBlock()
    const currentBlockDetail = currentBlock?.uuid
      ? await logseq.Editor.getBlock(currentBlock?.uuid, { includeChildren: true })
      : undefined
    const currentContent = currentBlockDetail
      ? currentBlockDetail?.children?.[0]?.content
      : undefined

    const d2Id = `d2_${payload.uuid}`

    const blockDetail = await logseq.Editor.getBlock(payload.uuid, { includeChildren: true })
    const content = blockDetail?.children?.[0]?.content
    const contentUuid = blockDetail?.children?.[0]?.uuid

    if (!content) {
      return
    }

    // 如何内容没有变化（比如块折叠），直接 return
    // TODO: 导致第一次也不会渲染了，先注释
    // if (currentContent === content) {
    //   return
    // }

    const d2Data = (content.includes('```d2') || content.includes('```D2')) ? content.slice(6, -4) : undefined

    logseq.provideUI({
      key: d2Id,
      slot,
      template: d2Data ? `加载中...` : `<span style="color: #f00;">您输入的不是 d2 代码，请检查后再试!<span>`,
    })

    if (!d2Data) {
      return
    }

    /**
     * 当开始加载图标的时候折叠代码块
     * 为什么不能在接口请求完成之后折叠
     * 因为折叠也会触发重新渲染，导致折叠永远打不开
     */
    // logseq.Editor.setBlockCollapsed(payload.uuid, true)


    let svgCode = ''
    // 增加接口缓存，避免重复请求
    const cacheKey = JSON.stringify({ diagramCode: d2Data })
    const cacheSvg = sessionStorage.getItem(cacheKey)
    if (cacheSvg) {
      svgCode = cacheSvg
    } else {
      const response = await fetch('https://d2api.fly.dev/getSvg', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=utf-8;',
          'Cache-Control': 'max-age=3600',
        },
        body: cacheKey,
      })

      // TODO: 接口请求失败处理

      svgCode = await response.text()
      sessionStorage.setItem(cacheKey, svgCode)
    }

    logseq.provideModel({
      edit(e) {
        logseq.Editor.editBlock(e.dataset.target)
        // logseq.Editor.setBlockCollapsed(payload.uuid, false)
      }
    })

    let modifiedsvgstring = svgCode

    const parser = new DOMParser();
    const svgDOM = parser.parseFromString(svgCode, 'image/svg+xml').querySelector('svg');

    if (svgDOM && (width || height)) {
      svgDOM.setAttribute('width', width);
      svgDOM.setAttribute('height', height);

      const serializer = new XMLSerializer();
      modifiedsvgstring = serializer.serializeToString(svgDOM);
    }

    /**
     * data-* 这种方式设置的属性，可以在 logseq.provideModel 的 edit 函数中拿到对应的值
     * e.dataset.*
     */
    logseq.provideUI({
      key: d2Id,
      slot,
      template: `
        <div class="d2-wrapper">
          <button
            class="edit-button"
            data-target="${contentUuid}"
            data-on-click="edit"
          >编辑</button>
          ${modifiedsvgstring}
        </div>
      `,
    })
  })
}

// bootstrap
logseq.ready(main).catch(console.error)
