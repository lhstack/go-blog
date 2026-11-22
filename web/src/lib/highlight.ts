import type { HLJSApi } from 'highlight.js'
import { useEffect, useState } from 'react'

/**
 * 代码高亮属于阅读增强：highlight.js 全量包（193 种语言）单独成块懒加载，
 * 首屏不承担这份体积。语言类名与后端 goldmark 一致（language-xxx），
 * 因此服务端渲染的正文与编辑器预览走同一套规则。
 */
let highlighterPromise: Promise<HLJSApi> | null = null

function loadHighlighter(): Promise<HLJSApi> {
  if (!highlighterPromise) {
    highlighterPromise = import('highlight.js').then((module) => module.default)
  }
  return highlighterPromise
}

const LANGUAGE_CLASS = /^(?:language|lang)-(.+)$/

// detectLanguage 读取 fence 上的语言标记，支持 language-x 与 lang-x 两种写法。
function detectLanguage(code: Element): string {
  for (const name of Array.from(code.classList)) {
    const matched = LANGUAGE_CLASS.exec(name)
    if (matched) {
      return matched[1].toLowerCase()
    }
  }
  return ''
}

function addLanguageBadge(pre: Element, language: string): void {
  if (!language || pre.querySelector('.code-lang')) {
    return
  }
  const badge = document.createElement('span')
  badge.className = 'code-lang'
  badge.textContent = language
  pre.appendChild(badge)
}

// applyHighlight 就地替换代码块内容：成功则写入高亮片段，失败保持原始纯文本。
function applyHighlight(hljs: HLJSApi, code: HTMLElement): void {
  if (code.dataset.highlighted || !code.isConnected) {
    return
  }
  const source = code.textContent ?? ''
  const requested = detectLanguage(code)
  const known = requested !== '' && hljs.getLanguage(requested) !== undefined

  const result = known
    ? hljs.highlight(source, { language: requested })
    : hljs.highlightAuto(source)

  // 自动识别没有任何命中时不改写内容，也不猜语言；标明未高亮便于排查。
  if (!result.language) {
    code.dataset.highlighted = 'false'
    return
  }

  code.innerHTML = result.value
  code.classList.add('hljs')
  code.dataset.highlighted = 'true'
  code.dataset.language = result.language

  const pre = code.closest('pre')
  if (pre) {
    addLanguageBadge(pre, known ? requested : result.language)
  }
}

/**
 * highlightCodeBlocks 为容器内所有代码块补上语法高亮，可重复调用：
 * 已高亮的块会被跳过，因此额外重渲染不会重复处理。
 */
export async function highlightCodeBlocks(root: ParentNode): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('pre > code'))
  if (blocks.length === 0) {
    return
  }
  const hljs = await loadHighlighter()
  for (const code of blocks) {
    applyHighlight(hljs, code)
  }
}

/**
 * useCodeHighlight 在正文 HTML 变化或容器挂载后异步补上高亮。
 * 返回回调 ref，而不是 useRef：编辑器预览面板可能后于内容才挂载
 *（先“只写”后切“预览”），只依赖 html 变化会错过这次挂载。
 */
export function useCodeHighlight(html: string) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!root || !html) {
      return
    }
    highlightCodeBlocks(root).catch((error: unknown) => {
      console.warn('代码高亮加载失败，已保留原始文本', error)
    })
  }, [root, html])

  return setRoot
}
