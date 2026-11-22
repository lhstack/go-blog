import { Button, Col, Empty, Pagination, Row, Skeleton, Space, Tag, Typography } from 'antd'
import { BookOutlined } from '@ant-design/icons'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { PostSummary } from '../api/types'
import { PostCard, SideCard } from '../components/PostCard'
import { ErrorResult } from '../components/Feedback'
import { useSite } from '../context/SiteContext'
import { useAsync } from '../lib/useAsync'
import { formatDate } from '../lib/format'

const PAGE_SIZE = 8

// splitVerses 把后台填写的多行诗句拆成轮播用的句子列表，空行自动忽略。
function splitVerses(verses: string | undefined): string[] {
  return (verses ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

// HomePage 展示站点介绍、精选文章与最新文章。
export function HomePage() {
  const { site } = useSite()
  const [page, setPage] = useState(1)
  const [verseIndex, setVerseIndex] = useState(0)
  const posts = useAsync(
    (signal) => api.listPosts({ page, pageSize: PAGE_SIZE }, signal),
    [page],
  )
  const featured = useAsync(
    (signal) => api.listPosts({ page: 1, pageSize: 3, featured: true }, signal),
    [],
  )

  const settings = site?.settings
  const verses = useMemo(() => splitVerses(settings?.verses), [settings?.verses])

  // 诗句数量或内容变化后重新从第一句开始，避免索引越界。
  useEffect(() => {
    setVerseIndex(0)
  }, [verses.length])

  useEffect(() => {
    if (verses.length < 2) {
      return
    }
    const timer = window.setInterval(() => {
      setVerseIndex((index) => (index + 1) % verses.length)
    }, 6400)
    return () => window.clearInterval(timer)
  }, [verses.length])

  const showFeatured = featured.data && featured.data.items.length > 0 && page === 1
  const sealText = useMemo(() => {
    const author = settings?.author || '逍遥'
    return author.slice(0, 2)
  }, [settings?.author])

  return (
    <>
      <section className="hero">
        {settings?.cover && (
          <div className="hero__cover" style={{ backgroundImage: `url(${settings.cover})` }} />
        )}
        <div style={{ position: 'relative' }}>
          <h1 className="hero__title">{settings?.title || '我的博客'}</h1>
          <p className="hero__subtitle">
            {settings?.subtitle || settings?.description || '记录思考、代码与生活。'}
          </p>
          {verses.length > 0 && (
            <p className="hero__verse" key={verseIndex}>
              <span>{verses[verseIndex]}</span>
            </p>
          )}
          <Space size={8} wrap className="hero__meta">
            <Link to="/posts">
              <Button type="primary" icon={<BookOutlined />}>
                开卷有得
              </Button>
            </Link>
            <Link to="/archive">
              <Button>时间归档</Button>
            </Link>
            <Button href="/rss.xml" target="_blank">
              RSS 订阅
            </Button>
          </Space>
        </div>
        <div className="hero__seal" title={settings?.author || '逍遥'}>
          {sealText}
        </div>
      </section>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={16}>
          {showFeatured && (
            <div style={{ marginBottom: 22 }}>
              <div className="section-head">
                <Typography.Title level={4} className="section-head__title">
                  精选
                </Typography.Title>
                <span className="section-head__line" />
              </div>
              <div className="post-grid">
                {featured.data!.items.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            </div>
          )}

          <div className="section-head" style={{ margin: '28px 0 14px' }}>
            <Typography.Title level={4} className="section-head__title">
              最新文章
            </Typography.Title>
            <span className="section-head__line" />
          </div>

          {posts.loading && !posts.data && <Skeleton active paragraph={{ rows: 6 }} />}
          {posts.error && <ErrorResult title="文章加载失败" description={posts.error} />}
          {posts.data && posts.data.items.length === 0 && (
            <Empty
              description="还没有文章"
              style={{ padding: '48px 0' }}
            >
              <Link to="/admin">
                <Button type="primary">去写第一篇</Button>
              </Link>
            </Empty>
          )}

          <div className="post-grid">
            {posts.data?.items.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>

          {posts.data && posts.data.total > PAGE_SIZE && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 26 }}>
              <Pagination
                current={page}
                pageSize={PAGE_SIZE}
                total={posts.data.total}
                showSizeChanger={false}
                onChange={setPage}
              />
            </div>
          )}
        </Col>

        <Col xs={24} lg={8}>
          <div className="side-column">
            <SideCard label="关于本站">
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <Typography.Paragraph className="side-card__prose">
                  {settings?.description || '这里会写一些关于编程的记录。'}
                </Typography.Paragraph>
                <Link to="/about" className="link-quiet">
                  了解更多 →
                </Link>
              </Space>
            </SideCard>

            <SideCard label="分类">
              {site?.categories.length ? (
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  {site.categories.map((category) => (
                    <Link
                      key={category.name}
                      to={`/posts?category=${encodeURIComponent(category.name)}`}
                      className="side-list__row"
                    >
                      <span>{category.name}</span>
                      <Typography.Text type="secondary">{category.count}</Typography.Text>
                    </Link>
                  ))}
                </Space>
              ) : (
                <Typography.Text type="secondary">暂无分类</Typography.Text>
              )}
            </SideCard>

            <SideCard label="标签云">
              {site?.tags.length ? (
                <div className="tag-cloud">
                  {site.tags.map((tag) => (
                    <Link key={tag.name} to={`/posts?tag=${encodeURIComponent(tag.name)}`}>
                      <Tag className="tag-seal">
                        {tag.name} · {tag.count}
                      </Tag>
                    </Link>
                  ))}
                </div>
              ) : (
                <Typography.Text type="secondary">暂无标签</Typography.Text>
              )}
            </SideCard>

            <RecentArchive />
          </div>
        </Col>
      </Row>
    </>
  )
}

// RecentArchive 展示最近更新的几篇文章标题，作为侧栏导航。
function RecentArchive() {
  const recent = useAsync((signal) => api.listPosts({ page: 1, pageSize: 5 }, signal), [])
  const items: PostSummary[] = recent.data?.items ?? []

  return (
    <SideCard label="最近更新">
      {recent.loading && <Skeleton active paragraph={{ rows: 3 }} title={false} />}
      {!recent.loading && items.length === 0 && <Typography.Text type="secondary">暂无内容</Typography.Text>}
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        {items.map((post) => (
          <div key={post.id}>
            <Link to={`/posts/${post.slug}`} className="side-list__title">
              {post.title}
            </Link>
            <div className="side-list__meta">{formatDate(post.publishedAt ?? post.updatedAt)}</div>
          </div>
        ))}
      </Space>
    </SideCard>
  )
}
