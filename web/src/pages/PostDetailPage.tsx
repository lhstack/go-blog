import { useState } from 'react'
import {
  Alert,
  Button,
  Col,
  Divider,
  Form,
  Input,
  Row,
  Space,
  Tag,
  Typography,
  message,
} from 'antd'
import { CalendarOutlined, ClockCircleOutlined, EyeOutlined, LinkOutlined, MessageOutlined } from '@ant-design/icons'
import { Link, useParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import type { CommentInput } from '../api/types'
import { ErrorResult, Loading } from '../components/Feedback'
import { CommentItem } from '../components/PostCard'
import { TagList } from '../components/TagList'
import { ArticleToc } from '../components/ArticleToc'
import { useAsync } from '../lib/useAsync'
import { useArticleMedia } from '../lib/useArticleMedia'
import { useCodeHighlight } from '../lib/highlight'
import { extractToc } from '../lib/toc'
import { copyText } from '../lib/clipboard'
import { formatDate, formatDateTime } from '../lib/format'
import { sanitizeHtml } from '../lib/markdown'
import { useSite } from '../context/SiteContext'

// PostDetailPage 展示文章正文、上下篇导航与评论。
export function PostDetailPage() {
  const { slug = '' } = useParams()
  const { site } = useSite()
  const detail = useAsync((signal) => api.getPost(slug, signal), [slug])
  const comments = useAsync((signal) => api.listComments(slug, signal), [slug])
  const html = sanitizeHtml(detail.data?.post.contentHtml ?? '')
  const tocEntries = extractToc(html)
  const { lightboxNode } = useArticleMedia(html)
  const codeRef = useCodeHighlight(html)

  if (detail.loading && !detail.data) {
    return <Loading tip="正在加载文章" />
  }
  if (detail.error) {
    return <ErrorResult status="404" title="文章不存在" description={detail.error} />
  }
  if (!detail.data) {
    return <ErrorResult title="没有内容" />
  }

  const { post, previous, next } = detail.data

  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} lg={17}>
        <article className="article">
          <h1 className="article__title">{post.title}</h1>
          <div className="article__meta">
            <span>
              <CalendarOutlined /> {formatDate(post.publishedAt ?? post.updatedAt)}
            </span>
            <span>
              <ClockCircleOutlined /> 约 {post.readingTime} 分钟
            </span>
            <span>
              <EyeOutlined /> {post.views} 次阅读
            </span>
            {post.category && <span>分类：{post.category}</span>}
          </div>

          {post.cover && <img className="article__cover" src={post.cover} alt={post.title} />}

          <div
            className="markdown-body"
            ref={codeRef}
            dangerouslySetInnerHTML={{ __html: html }}
          />

          {post.tags.length > 0 && (
            <>
              <Divider />
              <TagList tags={post.tags} />
            </>
          )}
        </article>

        {(previous || next) && (
          <div className="post-nav">
            {previous && (
              <Link to={`/posts/${previous.slug}`} className="post-nav__item">
                <span className="post-nav__label">← 上一篇</span>
                <span className="post-nav__title">{previous.title}</span>
              </Link>
            )}
            {next && (
              <Link to={`/posts/${next.slug}`} className="post-nav__item">
                <span className="post-nav__label">下一篇 →</span>
                <span className="post-nav__title">{next.title}</span>
              </Link>
            )}
          </div>
        )}

        <section className="article-comments">
          <h4 className="side-card__title">
            <MessageOutlined /> 评论（{comments.data?.items.length ?? 0}）
          </h4>

          {comments.loading && !comments.data && <Typography.Text type="secondary">正在加载评论…</Typography.Text>}
          {comments.error && <Alert type="error" showIcon message={comments.error} />}
          {comments.data && comments.data.items.length === 0 && (
            <Typography.Text type="secondary">还没有评论，欢迎留下第一条。</Typography.Text>
          )}

          <div className="comment-list">
            {comments.data?.items.map((comment) => (
              <CommentItem
                key={comment.id}
                author={comment.author}
                website={comment.website}
                time={formatDateTime(comment.createdAt)}
                content={comment.content}
              />
            ))}
          </div>

          <Divider />

          <CommentForm
            slug={slug}
            needReview={site?.settings.commentNeedReview ?? true}
            onSubmitted={() => comments.reload()}
          />
        </section>
      </Col>

      <Col xs={24} lg={7}>
        <div className="article-side">
          <Space direction="vertical" size={18} style={{ width: '100%' }}>
            {tocEntries.length > 1 && <ArticleToc entries={tocEntries} />}

            <section className="side-card">
              <h4 className="side-card__title">文章信息</h4>
              <Space direction="vertical" size={8} style={{ width: '100%', fontSize: 13.5 }}>
                <Row justify="space-between">
                  <Typography.Text type="secondary">发布时间</Typography.Text>
                  <span>{formatDate(post.publishedAt)}</span>
                </Row>
                <Row justify="space-between">
                  <Typography.Text type="secondary">最后更新</Typography.Text>
                  <span>{formatDate(post.updatedAt)}</span>
                </Row>
                <Row justify="space-between">
                  <Typography.Text type="secondary">阅读时长</Typography.Text>
                  <span>{post.readingTime} 分钟</span>
                </Row>
                <Row justify="space-between">
                  <Typography.Text type="secondary">阅读量</Typography.Text>
                  <span>{post.views}</span>
                </Row>
                <Divider style={{ margin: '6px 0' }} />
                <Button
                  block
                  icon={<LinkOutlined />}
                  onClick={async () => {
                    const ok = await copyText(window.location.href)
                    if (ok) {
                      message.success('链接已复制')
                    } else {
                      message.error('当前环境不允许复制，请手动复制地址栏')
                    }
                  }}
                >
                  复制本文链接
                </Button>
              </Space>
          </section>

          {site?.tags.length ? (
            <section className="side-card">
              <h4 className="side-card__title">标签</h4>
              <div className="tag-cloud">
                {site.tags.slice(0, 16).map((tag) => (
                  <Link key={tag.name} to={`/posts?tag=${encodeURIComponent(tag.name)}`}>
                    <Tag className={`tag-seal${post.tags.includes(tag.name) ? ' tag-seal--active' : ''}`}>
                      {tag.name}
                    </Tag>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
          </Space>
        </div>
      </Col>

      {lightboxNode}
    </Row>
  )
}

interface CommentFormProps {
  slug: string
  needReview: boolean
  onSubmitted: () => void
}

// CommentForm 提交访客评论，按审核设置给出不同提示。
function CommentForm({ slug, needReview, onSubmitted }: CommentFormProps) {
  const [form] = Form.useForm<CommentInput>()
  const [submitting, setSubmitting] = useState(false)

  const onFinish = async (values: CommentInput) => {
    setSubmitting(true)
    try {
      const result = await api.createComment(slug, values)
      message.success(result.message)
      form.resetFields(['content'])
      onSubmitted()
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) {
        form.setFields(
          Object.entries(err.fields).map(([name, error]) => ({
            name: name === 'author' ? 'author' : name,
            errors: [error],
          })) as never,
        )
      } else {
        message.error(err instanceof Error ? err.message : '评论提交失败')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
      <Row gutter={12}>
        <Col xs={24} sm={8}>
          <Form.Item name="author" label="昵称" rules={[{ required: true, message: '请填写昵称' }]}>
            <Input placeholder="你的昵称" maxLength={40} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={8}>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[{ type: 'email', message: '邮箱格式不正确' }]}
            extra="不会公开"
          >
            <Input placeholder="可选" maxLength={120} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={8}>
          <Form.Item name="website" label="网站" rules={[{ type: 'url', message: '请输入完整网址' }]}>
            <Input placeholder="可选" maxLength={200} />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item
        name="content"
        label="评论内容"
        rules={[{ required: true, message: '请填写评论内容' }]}
      >
        <Input.TextArea rows={4} maxLength={1000} showCount placeholder="想说的话…" />
      </Form.Item>
      <Space align="center">
        <Button type="primary" htmlType="submit" loading={submitting}>
          提交评论
        </Button>
        <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
          {needReview ? '评论会在审核后展示' : '评论将立即展示'}
        </Typography.Text>
      </Space>
    </Form>
  )
}
