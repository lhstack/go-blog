import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'

/**
 * 编辑页实时预览与后端 goldmark 输出保持一致：开启表格、删除线等 GFM 能力。
 * 代码块的产物也与 goldmark 对齐——只输出 <pre><code class="language-xxx">，
 * 高亮在挂载到 DOM 之后由 lib/highlight 统一补齐，避免预览与线上两套渲染。
 */
const md: MarkdownIt = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
  typographer: false,
  highlight(code: string, language: string): string {
    const className = language ? ` class="language-${md.utils.escapeHtml(language)}"` : ''
    return `<pre><code${className}>${md.utils.escapeHtml(code)}</code></pre>`
  },
})

/**
 * renderMarkdown 把 Markdown 源文渲染为可安全插入的 HTML。
 * 后端已渲染过正文，此函数仅用于编辑预览，因此统一做一次净化。
 */
export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(md.render(source), {
    ADD_ATTR: ['target', 'rel'],
  })
}

/** sanitizeHtml 用于清洗后端返回的 HTML 片段。 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel'] })
}
