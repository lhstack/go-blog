import { useEffect, useState } from 'react'
import { ArrowUpOutlined } from '@ant-design/icons'

/**
 * BackToTop 是右下角的“归卷”按钮：
 * 页面滚动超过一屏后浮现，点击回到顶部；不显示任何文字，只留一枚印章式圆钮。
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.9)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <button
      type="button"
      className={`back-to-top${visible ? ' back-to-top--visible' : ''}`}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="回到顶部"
      title="回到顶部"
      tabIndex={visible ? 0 : -1}
    >
      <ArrowUpOutlined />
    </button>
  )
}
