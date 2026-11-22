import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { PublicLayout } from './components/PublicLayout'
import { ErrorResult, Loading } from './components/Feedback'
import { useAuth } from './context/AuthContext'
import { HomePage } from './pages/HomePage'

// 前台首屏只加载首页，其余页面按需加载，减小首包体积。
const PostListPage = lazy(() => import('./pages/PostListPage').then((m) => ({ default: m.PostListPage })))
const PostDetailPage = lazy(() =>
  import('./pages/PostDetailPage').then((m) => ({ default: m.PostDetailPage })),
)
const ArchivePage = lazy(() => import('./pages/ArchivePage').then((m) => ({ default: m.ArchivePage })))
const AboutPage = lazy(() => import('./pages/AboutPage').then((m) => ({ default: m.AboutPage })))
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })))

// 管理后台整块懒加载，访客永远不会下载这些代码。
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })))
const DashboardPage = lazy(() =>
  import('./pages/admin/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const PostManagePage = lazy(() =>
  import('./pages/admin/PostManagePage').then((m) => ({ default: m.PostManagePage })),
)
const PostEditorPage = lazy(() =>
  import('./pages/admin/PostEditorPage').then((m) => ({ default: m.PostEditorPage })),
)
const CommentManagePage = lazy(() =>
  import('./pages/admin/CommentManagePage').then((m) => ({ default: m.CommentManagePage })),
)
const SettingsPage = lazy(() =>
  import('./pages/admin/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)

// RequireAuth 保护后台路由，未登录时带上来源地址跳转登录页。
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { profile, ready } = useAuth()
  const location = useLocation()

  if (!ready) {
    return <Loading tip="正在校验登录状态" />
  }
  if (!profile) {
    return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />
  }
  return <>{children}</>
}

// page 包装懒加载页面，统一给出加载占位。
function page(node: React.ReactNode) {
  return <Suspense fallback={<Loading />}>{node}</Suspense>
}

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <PublicLayout>
            <HomePage />
          </PublicLayout>
        }
      />
      <Route
        path="/posts"
        element={<PublicLayout>{page(<PostListPage />)}</PublicLayout>}
      />
      <Route
        path="/posts/:slug"
        element={<PublicLayout>{page(<PostDetailPage />)}</PublicLayout>}
      />
      <Route
        path="/archive"
        element={<PublicLayout>{page(<ArchivePage />)}</PublicLayout>}
      />
      <Route path="/about" element={<PublicLayout>{page(<AboutPage />)}</PublicLayout>} />

      <Route path="/admin/login" element={page(<LoginPage />)} />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <Suspense fallback={<Loading />}>
              <AdminLayout />
            </Suspense>
          </RequireAuth>
        }
      >
        <Route index element={page(<DashboardPage />)} />
        <Route path="posts" element={page(<PostManagePage />)} />
        <Route path="posts/new" element={page(<PostEditorPage />)} />
        <Route path="posts/:id" element={page(<PostEditorPage />)} />
        <Route path="comments" element={page(<CommentManagePage />)} />
        <Route path="settings" element={page(<SettingsPage />)} />
      </Route>

      <Route
        path="*"
        element={
          <PublicLayout>
            <ErrorResult status="404" title="页面不存在" description="你访问的地址可能已被移动或删除。" />
          </PublicLayout>
        }
      />
    </Routes>
  )
}
