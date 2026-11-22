import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  AutoComplete,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  Row,
  Segmented,
  Select,
  Space,
  Switch,
  Upload,
  message,
} from 'antd'
import type { UploadProps } from 'antd'
import {
  ArrowLeftOutlined,
  EyeOutlined,
  PictureOutlined,
  SaveOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../../api/client'
import type { PostInput, PostStatus } from '../../api/types'
import { renderMarkdown } from '../../lib/markdown'
import { useCodeHighlight } from '../../lib/highlight'
import { Loading } from '../../components/Feedback'
import { useSite } from '../../context/SiteContext'

const EMPTY: PostInput = {
  title: '',
  slug: '',
  summary: '',
  contentMd: '',
  cover: '',
  category: '',
  status: 'draft',
  featured: false,
  tags: [],
}

interface FormValues extends Omit<PostInput, 'tags'> {
  tags: string[]
}

// PostEditorPage 同时承担新建与编辑，左侧编写 Markdown，右侧实时预览。
export function PostEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { site } = useSite()
  const postID = id ? Number(id) : null
  const isEdit = postID !== null

  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [content, setContent] = useState('')
  const [mode, setMode] = useState<'split' | 'write' | 'preview'>('split')

  useEffect(() => {
    if (!isEdit) {
      form.setFieldsValue(EMPTY)
      setContent('')
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    api
      .adminGetPost(postID, controller.signal)
      .then((post) => {
        form.setFieldsValue({
          title: post.title,
          slug: post.slug,
          summary: post.summary,
          contentMd: post.contentMd,
          cover: post.cover,
          category: post.category,
          status: post.status,
          featured: post.featured,
          tags: post.tags,
        })
        setContent(post.contentMd)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) {
          return
        }
        setError(err instanceof Error ? err.message : '文章加载失败')
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })
    return () => controller.abort()
  }, [form, isEdit, postID])

  const previewHtml = useMemo(() => {
    if (!content.trim()) {
      return ''
    }
    return renderMarkdown(content)
  }, [content])
  const previewRef = useCodeHighlight(previewHtml)

  const save = useCallback(
    async (status: PostStatus) => {
      let values: FormValues
      try {
        values = await form.validateFields()
      } catch {
        return
      }

      setSaving(true)
      setError('')
      const payload: PostInput = {
        ...values,
        status,
        contentMd: content,
        tags: values.tags ?? [],
      }

      try {
        if (isEdit) {
          await api.adminUpdatePost(postID, payload)
          message.success(status === 'published' ? '已保存并发布' : '已保存为草稿')
        } else {
          const created = await api.adminCreatePost(payload)
          message.success(status === 'published' ? '已发布' : '草稿已保存')
          navigate(`/admin/posts/${created.id}`, { replace: true })
          return
        }
        form.setFieldValue('status', status)
      } catch (err) {
        if (err instanceof ApiError && Object.keys(err.fields).length > 0) {
          form.setFields(
            Object.entries(err.fields).map(([name, reason]) => ({
              name: name as keyof FormValues,
              errors: [reason],
            })),
          )
          message.error('请检查表单中的错误')
        } else {
          message.error(err instanceof Error ? err.message : '保存失败')
        }
      } finally {
        setSaving(false)
      }
    },
    [content, form, isEdit, navigate, postID],
  )

  if (loading) {
    return <Loading tip="正在加载文章" />
  }
  if (error && isEdit) {
    return <Alert type="error" showIcon message={error} /> 
  }

  const uploadProps: UploadProps = {
    accept: 'image/*',
    showUploadList: false,
    async customRequest(options) {
      try {
        const result = await api.adminUpload(options.file as File)
        form.setFieldValue('cover', result.url)
        message.success('封面已上传')
        options.onSuccess?.(result)
      } catch (err) {
        options.onError?.(err as Error)
        message.error(err instanceof Error ? err.message : '上传失败')
      }
    },
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Space>
          <Link to="/admin/posts">
            <Button icon={<ArrowLeftOutlined />} />
          </Link>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{isEdit ? '编辑文章' : '新建文章'}</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-4)' }}>
              支持 Markdown、表格、代码块与任务列表
            </div>
          </div>
        </Space>
        <Space>
          <Segmented
            value={mode}
            onChange={(value) => setMode(value as typeof mode)}
            options={[
              { label: '分栏', value: 'split' },
              { label: '只写', value: 'write' },
              { label: '预览', value: 'preview' },
            ]}
          />
          <Button icon={<SaveOutlined />} loading={saving} onClick={() => save('draft')}>
            存为草稿
          </Button>
          <Button type="primary" icon={<SendOutlined />} loading={saving} onClick={() => save('published')}>
            发布
          </Button>
        </Space>
      </Space>

      <Form form={form} layout="vertical" initialValues={EMPTY} requiredMark={false}>
        <Row gutter={[18, 0]}>
          <Col xs={24} xl={16}>
            <Form.Item
              name="title"
              rules={[{ required: true, message: '请输入文章标题' }]}
              style={{ marginBottom: 12 }}
            >
              <Input
                size="large"
                placeholder="文章标题"
                maxLength={120}
                showCount
                style={{ fontSize: 20, fontWeight: 600 }}
              />
            </Form.Item>

            <div className="editor-shell">
              {mode !== 'preview' && (
                <div className="editor-pane">
                  <div className="editor-pane__head">
                    <span>MARKDOWN</span>
                    <span className="admin-meta-text">{content.length} 字符</span>
                  </div>
                  <div className="editor-pane__body" style={{ padding: 0 }}>
                    <textarea
                      className="editor-textarea"
                      value={content}
                      onChange={(event) => {
                        setContent(event.target.value)
                        form.setFieldValue('contentMd', event.target.value)
                      }}
                      placeholder={'# 标题\n\n开始写作…'}
                      spellCheck={false}
                      style={{ minHeight: 480, padding: '14px 16px' }}
                    />
                  </div>
                </div>
              )}

              {mode !== 'write' && (
                <div className="editor-pane">
                  <div className="editor-pane__head">
                    <span>PREVIEW</span>
                    <span className="admin-meta-text">
                      <EyeOutlined /> 实时预览
                    </span>
                  </div>
                  <div className="editor-pane__body">
                    {previewHtml ? (
                      <div
                        className="markdown-body"
                        ref={previewRef}
                        dangerouslySetInnerHTML={{ __html: previewHtml }}
                      />
                    ) : (
                      <div className="empty-preview">在左侧输入内容后这里会显示预览</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Form.Item
              name="contentMd"
              rules={[
                {
                  validator: (_, value: string) =>
                    value && value.trim().length > 0
                      ? Promise.resolve()
                      : Promise.reject(new Error('请输入文章正文')),
                },
              ]}
              style={{ marginBottom: 0, marginTop: 8 }}
            >
              <Input type="hidden" />
            </Form.Item>
          </Col>

          <Col xs={24} xl={8}>
            <Card variant="borderless" size="small" style={{ marginBottom: 14 }}>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Form.Item name="status" label="状态" style={{ marginBottom: 0 }}>
                  <Select
                    options={[
                      { value: 'draft', label: '草稿' },
                      { value: 'published', label: '已发布' },
                    ]}
                  />
                </Form.Item>
                <Form.Item name="slug" label="访问路径" style={{ marginBottom: 0 }} extra="留空则由标题自动生成">
                  <Input addonBefore="/posts/" placeholder="my-first-post" maxLength={80} />
                </Form.Item>
                <Form.Item name="featured" label="设为精选" valuePropName="checked" style={{ marginBottom: 0 }}>
                  <Switch />
                </Form.Item>
              </Space>
            </Card>

            <Card variant="borderless" size="small" style={{ marginBottom: 14 }}>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Form.Item name="category" label="分类" style={{ marginBottom: 0 }}>
                  <AutoComplete
                    allowClear
                    placeholder="选择或输入新分类"
                    options={(site?.categories ?? []).map((item) => ({ value: item.name }))}
                  />
                </Form.Item>
                <Form.Item name="tags" label="标签" style={{ marginBottom: 0 }} extra="回车确认，最多 8 个">
                  <Select
                    mode="tags"
                    placeholder="输入后回车"
                    tokenSeparators={[',', '，']}
                    options={(site?.tags ?? []).map((tag) => ({ value: tag.name, label: tag.name }))}
                  />
                </Form.Item>
                <Form.Item name="summary" label="摘要" style={{ marginBottom: 0 }} extra="留空自动截取正文">
                  <Input.TextArea rows={3} maxLength={300} showCount placeholder="一句话概括本文" />
                </Form.Item>
              </Space>
            </Card>

            <Card variant="borderless" size="small">
              <Form.Item name="cover" label="封面图" style={{ marginBottom: 8 }}>
                <Input placeholder="图片地址或上传" allowClear prefix={<PictureOutlined />} />
              </Form.Item>
              <Space>
                <Upload {...uploadProps}>
                  <Button size="small" icon={<PictureOutlined />}>
                    上传封面
                  </Button>
                </Upload>
                <Form.Item noStyle shouldUpdate>
                  {() => {
                    const cover = form.getFieldValue('cover') as string | undefined
                    return cover ? (
                      <img
                        src={cover}
                        alt="封面预览"
                        style={{ width: 88, height: 56, objectFit: 'cover', borderRadius: 8 }}
                      />
                    ) : null
                  }}
                </Form.Item>
              </Space>
              <Divider style={{ margin: '12px 0' }} />
              <div style={{ fontSize: 12.5, color: 'var(--ink-4)', lineHeight: 1.8 }}>
                正文中的图片可直接把上传地址粘贴为 Markdown 图片语法：
                <br />
                <code>![说明](/uploads/2026/01/xxx.png)</code>
              </div>
            </Card>
          </Col>
        </Row>
      </Form>
    </Space>
  )
}
