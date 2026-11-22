import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  Row,
  Space,
  Switch,
  Typography,
  message,
} from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { api, ApiError } from '../../api/client'
import type { Settings } from '../../api/types'
import { useSite } from '../../context/SiteContext'
import { useAuth } from '../../context/AuthContext'

// SettingsPage 编辑站点信息与管理员密码。
export function SettingsPage() {
  const { site, reload: reloadSite } = useSite()
  const { reload: reloadProfile } = useAuth()
  const [form] = Form.useForm<Settings>()
  const [passwordForm] = Form.useForm<{ oldPassword: string; newPassword: string; confirm: string }>()
  const [saving, setSaving] = useState(false)
  const [changing, setChanging] = useState(false)

  useEffect(() => {
    api
      .adminGetSettings()
      .then((settings) => form.setFieldsValue(settings))
      .catch((err: unknown) => {
        message.error(err instanceof Error ? err.message : '加载设置失败')
      })
  }, [form])

  const save = async (values: Settings) => {
    setSaving(true)
    try {
      const saved = await api.adminSaveSettings(values)
      form.setFieldsValue(saved)
      reloadSite()
      message.success('设置已保存')
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) {
        form.setFields(
          Object.entries(err.fields).map(([name, reason]) => ({
            name: name as keyof Settings,
            errors: [reason],
          })),
        )
      }
      message.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const changePassword = async (values: { oldPassword: string; newPassword: string }) => {
    setChanging(true)
    try {
      await api.changePassword(values.oldPassword, values.newPassword)
      passwordForm.resetFields()
      await reloadProfile()
      message.success('密码已更新')
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) {
        passwordForm.setFields(
          Object.entries(err.fields).map(([name, reason]) => ({
            name: name as 'oldPassword' | 'newPassword',
            errors: [reason],
          })),
        )
      }
      message.error(err instanceof Error ? err.message : '修改密码失败')
    } finally {
      setChanging(false)
    }
  }

  return (
    <Space direction="vertical" size={18} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={3} style={{ margin: 0 }}>
          设置
        </Typography.Title>
        <Typography.Text type="secondary">站点信息、社交链接与评论策略</Typography.Text>
      </div>

      {!site && <Alert type="warning" showIcon message="站点信息尚未加载完成" />}

      <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
        <Card variant="borderless" title="站点信息" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="title"
                label="站点标题"
                rules={[{ required: true, message: '请输入站点标题' }]}
              >
                <Input maxLength={60} showCount />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="subtitle" label="副标题">
                <Input maxLength={120} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="description" label="站点描述">
                <Input.TextArea rows={3} maxLength={300} showCount />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="author" label="作者">
                <Input maxLength={40} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="avatar" label="头像地址">
                <Input placeholder="/uploads/... 或外链" maxLength={500} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="cover" label="首页背景图">
                <Input placeholder="/uploads/... 或外链" maxLength={500} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="footer" label="页脚文字">
                <Input maxLength={200} />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        <Card variant="borderless" title="首页卷首" style={{ marginBottom: 16 }}>
          <Form.Item
            name="verses"
            label="卷首诗句"
            extra="一行一句，留多行会按顺序轮播；留空则不显示诗句。最多 20 句，每句 60 字以内。"
          >
            <Input.TextArea
              rows={6}
              maxLength={1280}
              showCount
              placeholder={'北冥有鱼，其名为鲲。\n鹏之徙于南冥也，水击三千里。'}
            />
          </Form.Item>
        </Card>

        <Card variant="borderless" title="链接与备案" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="github" label="GitHub 地址" rules={[{ type: 'url', message: '请输入完整网址' }]}>
                <Input placeholder="https://github.com/..." maxLength={200} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="email" label="联系邮箱" rules={[{ type: 'email', message: '邮箱格式不正确' }]}>
                <Input maxLength={120} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="icp" label="ICP 备案号">
                <Input maxLength={60} />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        <Card variant="borderless" title="评论">
          <Form.Item
            name="commentNeedReview"
            label="新评论需要审核后展示"
            valuePropName="checked"
            style={{ marginBottom: 0 }}
          >
            <Switch />
          </Form.Item>
        </Card>

        <Space style={{ marginTop: 18 }}>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
            保存设置
          </Button>
        </Space>
      </Form>

      <Card variant="borderless" title="修改密码">
        <Form form={passwordForm} layout="vertical" onFinish={changePassword} requiredMark={false}>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item
                name="oldPassword"
                label="当前密码"
                rules={[{ required: true, message: '请输入当前密码' }]}
              >
                <Input.Password autoComplete="current-password" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="newPassword"
                label="新密码"
                rules={[
                  { required: true, message: '请输入新密码' },
                  { min: 8, message: '至少 8 个字符' },
                ]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="confirm"
                label="确认新密码"
                dependencies={['newPassword']}
                rules={[
                  { required: true, message: '请再次输入新密码' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('newPassword') === value) {
                        return Promise.resolve()
                      }
                      return Promise.reject(new Error('两次输入的密码不一致'))
                    },
                  }),
                ]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
            </Col>
          </Row>
          <Button htmlType="submit" loading={changing}>
            更新密码
          </Button>
        </Form>
        <Divider style={{ margin: '16px 0 10px' }} />
        <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
          修改密码后当前登录仍然有效，其它已签发的令牌会在过期后失效。
        </Typography.Text>
      </Card>
    </Space>
  )
}
