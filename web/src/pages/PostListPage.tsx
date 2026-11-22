import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Col, Empty, Input, Pagination, Row, Skeleton, Space, Tag, Typography } from 'antd'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useSearchParams, Link } from 'react-router-dom'
import { api } from '../api/client'
import type { PostSummary } from '../api/types'
import { PostCard } from '../components/PostCard'
import { useSite } from '../context/SiteContext'
import { useAsync } from '../lib/useAsync'

const PAGE_SIZE = 8

// PostListPage 提供文章列表、搜索与按标签/分类筛选。
export function PostListPage() {
  const { site } = useSite()
  const [searchParams, setSearchParams] = useSearchParams()
  const [keyword, setKeyword] = useState(searchParams.get('q') ?? '')
  const [page, setPage] = useState(1)

  const tag = searchParams.get('tag') ?? ''
  const category = searchParams.get('category') ?? ''
  const query = searchParams.get('q') ?? ''

  // 筛选条件变化时回到第一页，避免落在空白的后续页。
  useEffect(() => {
    setPage(1)
  }, [tag, category, query])

  useEffect(() => {
    setKeyword(query)
  }, [query])

  const posts = useAsync(
    (signal) => api.listPosts({ page, pageSize: PAGE_SIZE, tag, category, q: query }, signal),
    [page, tag, category, query],
  )

  const submitSearch = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams)
      if (value.trim()) {
        next.set('q', value.trim())
      } else {
        next.delete('q')
      }
      setSearchParams(next)
    },
    [searchParams, setSearchParams],
  )

  const clearFilters = useCallback(() => {
    setSearchParams(new URLSearchParams())
    setKeyword('')
  }, [setSearchParams])

  const activeFilters = useMemo(() => {
    const filters: { label: string; onClose: () => void }[] = []
    if (tag) {
      filters.push({
        label: `标签：${tag}`,
        onClose: () => {
          const next = new URLSearchParams(searchParams)
          next.delete('tag')
          setSearchParams(next)
        },
      })
    }
    if (category) {
      filters.push({
        label: `分类：${category}`,
        onClose: () => {
          const next = new URLSearchParams(searchParams)
          next.delete('category')
          setSearchParams(next)
        },
      })
    }
    if (query) {
      filters.push({
        label: `搜索：${query}`,
        onClose: () => {
          const next = new URLSearchParams(searchParams)
          next.delete('q')
          setSearchParams(next)
        },
      })
    }
    return filters
  }, [tag, category, query, searchParams, setSearchParams])

  const items: PostSummary[] = posts.data?.items ?? []

  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} lg={17}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Input.Search
            size="large"
            allowClear
            value={keyword}
            placeholder="搜索标题或正文关键词"
            enterButton={
              <Button type="primary" icon={<SearchOutlined />}>
                搜索
              </Button>
            }
            onChange={(event) => setKeyword(event.target.value)}
            onSearch={submitSearch}
          />

          {activeFilters.length > 0 && (
            <Space size={6} wrap>
              {activeFilters.map((filter) => (
                <Tag key={filter.label} closable onClose={filter.onClose} color="processing">
                  {filter.label}
                </Tag>
              ))}
              <Button size="small" type="link" icon={<ReloadOutlined />} onClick={clearFilters}>
                清除筛选
              </Button>
            </Space>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              文章列表
            </Typography.Title>
            <Typography.Text type="secondary">
              共 {posts.data?.total ?? 0} 篇
            </Typography.Text>
          </div>

          {posts.loading && !posts.data && <Skeleton active paragraph={{ rows: 5 }} />}
          {posts.error && (
            <Alert
              type="error"
              showIcon
              message="加载失败"
              description={posts.error}
              action={
                <Button size="small" onClick={posts.reload}>
                  重试
                </Button>
              }
            />
          )}
          {!posts.loading && !posts.error && items.length === 0 && (
            <Empty description="没有匹配的文章" style={{ padding: '48px 0' }} />
          )}

          <div className="post-grid">
            {items.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>

          {posts.data && posts.data.total > PAGE_SIZE && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Pagination
                current={page}
                pageSize={PAGE_SIZE}
                total={posts.data.total}
                showSizeChanger={false}
                onChange={setPage}
              />
            </div>
          )}
        </Space>
      </Col>

      <Col xs={24} lg={7}>
        <Space direction="vertical" size={18} style={{ width: '100%' }}>
          <section className="side-card">
            <h4 className="side-card__title">分类</h4>
            {site?.categories.length ? (
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {site.categories.map((item) => (
                  <Link
                    key={item.name}
                    to={`/posts?category=${encodeURIComponent(item.name)}`}
                    className={`side-list__row${category === item.name ? ' side-list__row--active' : ''}`}
                  >
                    <span>{item.name}</span>
                    <Typography.Text type="secondary">{item.count}</Typography.Text>
                  </Link>
                ))}
              </Space>
            ) : (
              <Typography.Text type="secondary">暂无分类</Typography.Text>
            )}
          </section>

          <section className="side-card">
            <h4 className="side-card__title">标签</h4>
            <div className="tag-cloud">
              {site?.tags.length ? (
                site.tags.map((item) => (
                  <Link key={item.name} to={`/posts?tag=${encodeURIComponent(item.name)}`}>
                    <Tag className={`tag-seal${tag === item.name ? ' tag-seal--active' : ''}`}>
                      {item.name} · {item.count}
                    </Tag>
                  </Link>
                ))
              ) : (
                <Typography.Text type="secondary">暂无标签</Typography.Text>
              )}
            </div>
          </section>
        </Space>
      </Col>
    </Row>
  )
}
