export interface TocEntry {
  id: string
  text: string
  level: number
}

/**
 * extractToc 从已渲染的正文 HTML 中提取二、三级标题，用于生成目录。
 * 后端 goldmark 开启了 WithAutoHeadingID，因此标题自带稳定 id，可直接作锚点。
 */
export function extractToc(html: string): TocEntry[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const headings = doc.querySelectorAll('h2, h3')
  const entries: TocEntry[] = []
  for (const heading of headings) {
    const id = heading.getAttribute('id')
    const text = heading.textContent?.trim() ?? ''
    if (!id || !text) {
      continue
    }
    entries.push({ id, text, level: heading.tagName === 'H2' ? 2 : 3 })
  }
  return entries
}
