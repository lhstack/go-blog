import { useEffect, useState } from 'react'
import type { TocEntry } from '../lib/toc'

interface Props {
  entries: TocEntry[]
}

/**
 * ArticleToc 是文章目录：点击跳到对应小节，滚动时高亮当前所在小节。
 * 没有标题的文章不渲染，避免侧栏出现空卡片。
 */
export function ArticleToc({ entries }: Props) {
  const [activeId, setActiveId] = useState<string>(entries[0]?.id ?? '')

  useEffect(() => {
    if (entries.length === 0) {
      return
    }
    setActiveId(entries[0].id)

    let frame = 0
    // 以视口上方 1/4 处为判定线：最后一个越过判定线的标题就是“正在阅读”的小节。
    // 直接用滚动位置计算，比 IntersectionObserver 更稳——页面顶部也能高亮第一章。
    const update = () => {
      frame = 0
      const line = window.innerHeight * 0.25
      let current = entries[0].id
      for (const entry of entries) {
        const element = document.getElementById(entry.id)
        if (element && element.getBoundingClientRect().top <= line) {
          current = entry.id
        }
      }
      setActiveId(current)
    }
    const schedule = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(update)
      }
    }

    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      if (frame !== 0) {
        cancelAnimationFrame(frame)
      }
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [entries])

  if (entries.length === 0) {
    return null
  }

  return (
    <section className="side-card article-toc">
      <h4 className="side-card__title">本篇目录</h4>
      <div className="article-toc__list">
        {entries.map((entry) => (
          <a
            key={entry.id}
            href={`#${entry.id}`}
            className={[
              'article-toc__link',
              entry.level === 3 ? 'article-toc__link--sub' : '',
              entry.id === activeId ? 'article-toc__link--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={(event) => {
              event.preventDefault()
              const target = document.getElementById(entry.id)
              if (!target) {
                return
              }
              target.scrollIntoView({ behavior: 'smooth', block: 'start' })
              setActiveId(entry.id)
            }}
          >
            {entry.text}
          </a>
        ))}
      </div>
    </section>
  )
}
