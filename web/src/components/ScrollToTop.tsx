import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * ScrollToTop 在路由变化时把页面带回顶部。
 * 只对 pathname 变化生效：同页内切换 ?tag= / ?page= 这类查询参数时，
 * 用户正在阅读筛选结果，不应被强行拉回顶部。
 */
export function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname])

  return null
}
