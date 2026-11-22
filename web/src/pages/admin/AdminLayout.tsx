import { Button, Menu, Space, Typography } from 'antd'
import {
  CommentOutlined,
  DashboardOutlined,
  FileTextOutlined,
  HomeOutlined,
  LogoutOutlined,
  PlusOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useSite } from '../../context/SiteContext'
import { AtmosphereDock } from '../../components/AtmosphereDock'

const menuItems = [
  { key: '/admin', icon: <DashboardOutlined />, label: <Link to="/admin">概览</Link> },
  { key: '/admin/posts', icon: <FileTextOutlined />, label: <Link to="/admin/posts">文章</Link> },
  { key: '/admin/comments', icon: <CommentOutlined />, label: <Link to="/admin/comments">评论</Link> },
  { key: '/admin/settings', icon: <SettingOutlined />, label: <Link to="/admin/settings">设置</Link> },
]

// AdminLayout 提供后台侧边导航与顶部操作区。
export function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { profile, logout } = useAuth()
  const { site } = useSite()

  const selectedKey =
    menuItems
      .filter((item) => item.key !== '/admin')
      .find((item) => location.pathname.startsWith(item.key))?.key ?? '/admin'

  const onLogout = () => {
    logout()
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header__inner">
          <Link to="/admin" className="site-brand">
            <span className="site-brand__mark">{(site?.settings.title || '博').slice(0, 1)}</span>
            <span>管理后台</span>
          </Link>
          <div style={{ flex: 1 }} />
          <Space size={8}>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              {profile?.displayName || profile?.username}
            </Typography.Text>
            <Link to="/">
              <Button size="small" icon={<HomeOutlined />}>
                站点
              </Button>
            </Link>
            <Button size="small" icon={<LogoutOutlined />} onClick={onLogout}>
              退出
            </Button>
          </Space>
        </div>
      </header>

      <main className="app-main" style={{ maxWidth: 1240 }}>
        <div className="admin-layout">
          <aside className="admin-tabs">
            <Menu mode="inline" selectedKeys={[selectedKey]} items={menuItems} />
            <div style={{ padding: '10px 8px 4px' }}>
              <Link to="/admin/posts/new">
                <Button type="primary" block icon={<PlusOutlined />}>
                  写文章
                </Button>
              </Link>
            </div>
          </aside>
          <section className="admin-panel">
            <Outlet />
          </section>
        </div>
      </main>
      <AtmosphereDock />
    </div>
  )
}
