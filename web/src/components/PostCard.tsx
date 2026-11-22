import { Space, Typography } from 'antd'
import { CalendarOutlined, ClockCircleOutlined, EyeOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import type { PostSummary } from '../api/types'
import { formatDate } from '../lib/format'
import { TagList } from './TagList'

interface Props {
  post: PostSummary
  showStatus?: boolean
}

// PostCard 是首页与列表页共用的文章摘要卡片。
export function PostCard({ post, showStatus = false }: Props) {
  const published = formatDate(post.publishedAt)
  return (
    <article className="post-card">
      <div className="post-card__head">
        <div style={{ minWidth: 0 }}>
          <h3 className="post-card__title">
            <Link to={`/posts/${post.slug}`}>{post.title}</Link>
          </h3>
          {post.summary && <p className="post-card__summary">{post.summary}</p>}
        </div>
        {post.cover && <img className="post-card__cover" src={post.cover} alt={post.title} loading="lazy" />}
      </div>

      <div className="post-card__footer">
        <span className="post-card__meta">
          <CalendarOutlined /> {post.publishedAt ? published : '草稿'}
        </span>
        <span className="post-card__meta">
          <ClockCircleOutlined /> {post.readingTime} 分钟
        </span>
        <span className="post-card__meta">
          <EyeOutlined /> {post.views}
        </span>
        {post.category && <span className="post-card__category">{post.category}</span>}
        {showStatus && (
          <span style={{ color: post.status === 'published' ? 'var(--seal)' : 'var(--ink-4)' }}>
            {post.status === 'published' ? '已发布' : '草稿'}
          </span>
        )}
        <TagList tags={post.tags} />
      </div>
    </article>
  )
}

interface CommentItemProps {
  author: string
  website?: string
  time: string
  content: string
}

// CommentItem 渲染单条评论。
export function CommentItem({ author, website, time, content }: CommentItemProps) {
  const name = author || '匿名'
  return (
    <div className="comment">
      <span className="comment__seal" aria-hidden="true">
        {name.slice(0, 1).toUpperCase()}
      </span>
      <div className="comment__body">
        <div className="comment__head">
          {website ? (
            <a href={website} target="_blank" rel="noreferrer noopener" className="comment__author">
              {name}
            </a>
          ) : (
            <span className="comment__author">{name}</span>
          )}
          <span className="comment__time">{time}</span>
        </div>
        <p className="comment__content">{content}</p>
      </div>
    </div>
  )
}

interface EmptyStateProps {
  title: string
  description?: string
  action?: React.ReactNode
}

// EmptyState 统一空列表呈现，避免各页面重复排版。
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <Space direction="vertical" size={6}>
        <Typography.Text strong>{title}</Typography.Text>
        {description && <Typography.Text type="secondary">{description}</Typography.Text>}
        {action && <div style={{ marginTop: 12 }}>{action}</div>}
      </Space>
    </div>
  )
}

// SideCard 是右侧栏的通用卡片容器。
export function SideCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="side-card">
      <h4 className="side-card__title">{label}</h4>
      {children}
    </section>
  )
}
