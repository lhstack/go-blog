import { SiteFooter } from './SiteFooter'
import { SiteHeader } from './SiteHeader'
import { AtmosphereDock } from './AtmosphereDock'
import { BackToTop } from './BackToTop'
import { ReadingProgress } from './ReadingProgress'
import { ScrollToTop } from './ScrollToTop'

// PublicLayout 提供带页头页脚、阅读进度与逍遥浮坞的页面骨架。
export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <ScrollToTop />
      <ReadingProgress />
      <SiteHeader />
      <main className="app-main">{children}</main>
      <SiteFooter />
      <BackToTop />
      <AtmosphereDock />
    </div>
  )
}
