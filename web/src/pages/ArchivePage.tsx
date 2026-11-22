import { Alert, Button, Skeleton, Space, Typography } from 'antd'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAsync } from '../lib/useAsync'
import { formatDate } from '../lib/format'

// ArchivePage 按年/月分组展示全部已发布文章。
export function ArchivePage() {
  const archive = useAsync((signal) => api.listArchive(signal), [])

  if (archive.loading && !archive.data) {
    return <Skeleton active paragraph={{ rows: 8 }} />
  }
  if (archive.error) {
    return <Alert type="error" showIcon message="归档加载失败" description={archive.error} />
  }

  const groups = archive.data?.items ?? []
  const byYear = new Map<string, typeof groups>()
  for (const group of groups) {
    const year = group.month.includes('-') ? group.month.slice(0, 4) : '待发布'
    const bucket = byYear.get(year) ?? []
    bucket.push(group)
    byYear.set(year, bucket)
  }
  const total = groups.reduce((sum, group) => sum + group.posts.length, 0)

  return (
    <div className="prose-page">
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 18 }} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>
          时间归档
        </Typography.Title>
        <Typography.Text type="secondary">共 {total} 篇</Typography.Text>
      </Space>

      {groups.length === 0 && (
        <div>
          <Typography.Text type="secondary">还没有已发布的文章。</Typography.Text>
          <div style={{ marginTop: 12 }}>
            <Link to="/admin">
              <Button type="primary" size="small">
                去后台写文章
              </Button>
            </Link>
          </div>
        </div>
      )}

      {[...byYear.entries()].map(([year, months]) => (
        <section key={year} className="archive-year">
          <h3 className="archive-year__title">{year}</h3>
          {months.map((group) => (
            <div key={group.month}>
              <div className="archive-month__label">{group.month}</div>
              {group.posts.map((post) => (
                <Link key={post.id} to={`/posts/${post.slug}`} className="archive-item">
                  <span className="archive-item__date">{formatDate(post.publishedAt ?? post.updatedAt)}</span>
                  <span className="archive-item__title">{post.title}</span>
                </Link>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
