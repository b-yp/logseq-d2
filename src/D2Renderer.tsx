import React from "react"

export default async function (props: { content: string }) {
  const { content } = props

  console.log('content', content)

  if (!content) {
    return `<span style="color: #f00;">No content</span>`
  }

  let svgCode = ''
  // 增加接口缓存，避免重复请求
  const cacheKey = JSON.stringify({ diagramCode: content.trim() })
  const cacheSvg = sessionStorage.getItem(cacheKey)
  if (cacheSvg) {
    svgCode = cacheSvg
  } else {
    const response = await fetch('https://d2-api.fly.dev/getSvg', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf-8;',
        'Cache-Control': 'max-age=3600',
      },
      mode: 'cors',
      body: cacheKey,
    })

    // TODO: 接口请求失败处理

    svgCode = await response.text()
    sessionStorage.setItem(cacheKey, svgCode)
  }

  return <div>
    {svgCode}
  </div>
}
