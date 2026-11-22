import { Button, Drawer, Space } from 'antd'
import { GithubOutlined, MailOutlined, MenuOutlined, SettingOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useSite } from '../context/SiteContext'

const navItems = [
  { path: '/', label: '首页' },
  { path: '/posts', label: '文章' },
  { path: '/archive', label: '归档' },
  { path: '/about', label: '关于' },
]

// SiteHeader 渲染品牌、主导航与快捷入口。窄屏时导航收进抽屉，避免横向裁切。
export function SiteHeader() {
  const { site } = useSite()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const settings = site?.settings
  const title = settings?.title || '博客'

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <button
          type="button"
          className="site-nav-toggle"
          onClick={() => setDrawerOpen(true)}
          aria-label="打开导航"
        >
          <MenuOutlined />
        </button>

        <Link to="/" className="site-brand">
          <span className="site-brand__mark">{title.slice(0, 1)}</span>
          <span className="site-brand__text">{title}</span>
        </Link>

        <nav className="site-nav">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`site-nav__link${isActive(item.path) ? ' site-nav__link--active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="site-header__actions">
          <Space size={2}>
            {settings?.github && (
              <Button
                className="site-header__social"
                type="text"
                shape="circle"
                icon={<GithubOutlined />}
                href={settings.github}
                target="_blank"
                rel="noreferrer noopener"
                title="GitHub"
              />
            )}
            {settings?.email && (
              <Button
                className="site-header__social"
                type="text"
                shape="circle"
                icon={<MailOutlined />}
                href={`mailto:${settings.email}`}
                title="邮件"
              />
            )}
            <Link to="/admin" title="管理后台">
              <Button type="text" shape="circle" icon={<SettingOutlined />} />
            </Link>
          </Space>
        </div>
      </div>

      <Drawer
        title={title}
        placement="left"
        width={240}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        styles={{ body: { padding: '8px 12px' } }}
      >
        <nav style={{ display: 'grid', gap: 4 }}>
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`site-nav__link${isActive(item.path) ? ' site-nav__link--active' : ''}`}
              style={{ padding: '10px 12px' }}
              onClick={() => setDrawerOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <Link
            to="/admin"
            className="site-nav__link"
            style={{ padding: '10px 12px' }}
            onClick={() => setDrawerOpen(false)}
          >
            管理后台
          </Link>
        </nav>
      </Drawer>
    </header>
  )
}
