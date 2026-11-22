import { useEffect } from 'react'
import { useSite } from '../context/SiteContext'

// SiteTitle 跟随站点配置更新浏览器标题，避免把默认文案硬编码在 index.html。
export function SiteTitle() {
  const { site } = useSite()
  const title = site?.settings.title
  const subtitle = site?.settings.subtitle

  useEffect(() => {
    if (!title) {
      return
    }
    document.title = subtitle ? `${title} · ${subtitle}` : title
  }, [title, subtitle])

  return null
}
