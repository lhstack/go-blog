import { useEffect, useRef } from 'react'

/**
 * ReadingProgress 是页面顶部的阅读进度细线：
 * 滚动时按文档高度实时推进，颜色取自朱砂，宽度用 transform 驱动避免重排。
 * 系统要求减少动效时仍然保留，因为它表达的是状态而不是装饰。
 */
export function ReadingProgress() {
  const barRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const bar = barRef.current
    if (!bar) {
      return
    }

    let frame = 0
    const update = () => {
      frame = 0
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      const progress = scrollable > 0 ? Math.min(window.scrollY / scrollable, 1) : 0
      bar.style.transform = `scaleX(${progress})`
      bar.dataset.visible = progress > 0.01 && progress < 0.995 ? 'true' : 'false'
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
  }, [])

  return <div ref={barRef} className="reading-progress" aria-hidden="true" />
}
