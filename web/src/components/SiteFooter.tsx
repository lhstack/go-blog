import { useSite } from '../context/SiteContext'

// SiteFooter 展示版权、站点说明与订阅入口。
export function SiteFooter() {
  const { site } = useSite()
  const settings = site?.settings
  const year = new Date().getFullYear()

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div>
          © {year} {settings?.title || '博客'}
          {settings?.author ? ` · ${settings.author}` : ''}
          {settings?.footer ? ` · ${settings.footer}` : ''}
        </div>
        <div className="site-footer__links">
          <a href="/rss.xml" target="_blank" rel="noreferrer noopener">
            RSS
          </a>
          {settings?.github && (
            <a href={settings.github} target="_blank" rel="noreferrer noopener">
              GitHub
            </a>
          )}
          {settings?.icp && (
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer noopener">
              {settings.icp}
            </a>
          )}
        </div>
      </div>
    </footer>
  )
}
