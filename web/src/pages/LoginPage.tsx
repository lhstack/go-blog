import { useState } from 'react'
import { Alert, Button, Card, Form, Input, Typography, message } from 'antd'
import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useSite } from '../context/SiteContext'
import { AtmosphereDock } from '../components/AtmosphereDock'

interface LoginForm {
  username: string
  password: string
}

// LoginPage 是管理后台入口，登录成功后跳回原目标页。
export function LoginPage() {
  const [form] = Form.useForm<LoginForm>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { login } = useAuth()
  const { site } = useSite()
  const navigate = useNavigate()
  const location = useLocation()

  const redirectTo = (location.state as { from?: string } | null)?.from || '/admin'

  const onFinish = async (values: LoginForm) => {
    setLoading(true)
    setError('')
    try {
      await login(values.username.trim(), values.password)
      message.success('欢迎回来')
      navigate(redirectTo, { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
        if (Object.keys(err.fields).length > 0) {
          form.setFields(
            Object.entries(err.fields).map(([name, message]) => ({
              name: name as keyof LoginForm,
              errors: [message],
            })),
          )
        }
      } else {
        setError('登录失败，请稍后重试')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <Card className="auth-card" variant="borderless">
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            {site?.settings.title || '博客'} · 后台
          </Typography.Title>
          <Typography.Text type="secondary">登录后可管理文章、评论与站点设置</Typography.Text>
        </div>

        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false} size="large">
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} autoComplete="username" placeholder="admin" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" placeholder="密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            登录
          </Button>
        </Form>

        <Typography.Paragraph type="secondary" style={{ marginTop: 18, marginBottom: 0, fontSize: 12.5 }}>
          首次启动会创建默认管理员（admin / admin123），登录后请立即修改密码。
        </Typography.Paragraph>
        <div style={{ marginTop: 12 }}>
          <Button type="link" size="small" style={{ paddingInline: 0 }} href="/">
            ← 返回站点
          </Button>
        </div>
      </Card>
      <AtmosphereDock />
    </div>
  )
}
