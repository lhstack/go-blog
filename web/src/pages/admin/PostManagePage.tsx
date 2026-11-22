import { useState } from 'react'
import {
  Button,
  Card,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import type { PostStatus, PostSummary } from '../../api/types'
import { useAsync } from '../../lib/useAsync'
import { formatDate } from '../../lib/format'
import { EmptyState } from '../../components/PostCard'

const PAGE_SIZE = 10

// PostManagePage 管理文章列表：筛选、编辑、删除。
export function PostManagePage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<PostStatus | ''>('')
  const [keyword, setKeyword] = useState('')
  const [applied, setApplied] = useState('')
  const [page, setPage] = useState(1)
  const [deletingID, setDeletingID] = useState<number | null>(null)

  const posts = useAsync(
    (signal) => api.adminListPosts({ page, pageSize: PAGE_SIZE, status, q: applied }, signal),
    [page, status, applied],
  )

  const remove = async (id: number) => {
    setDeletingID(id)
    try {
      await api.adminDeletePost(id)
      message.success('文章已删除')
      posts.reload()
    } catch (err) {
      message.error(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeletingID(null)
    }
  }

  return (
    <Space direction="vertical" size={18} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }} >
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            文章
          </Typography.Title>
          <Typography.Text type="secondary">共 {posts.data?.total ?? 0} 篇</Typography.Text>
        </div>
        <Space wrap>
          <Input
            allowClear
            value={keyword}
            placeholder="搜索标题或正文"
            prefix={<SearchOutlined />}
            style={{ width: 220 }}
            onChange={(event) => setKeyword(event.target.value)}
            onPressEnter={() => {
              setPage(1)
              setApplied(keyword.trim())
            }}
          />
          <Select
            value={status}
            style={{ width: 130 }}
            onChange={(value) => {
              setPage(1)
              setStatus(value)
            }}
            options={[
              { value: '', label: '全部状态' },
              { value: 'published', label: '已发布' },
              { value: 'draft', label: '草稿' },
            ]}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setPage(1)
              setApplied(keyword.trim())
            }}
          >
            刷新
          </Button>
          <Link to="/admin/posts/new">
            <Button type="primary" icon={<PlusOutlined />}>
              新建
            </Button>
          </Link>
        </Space>
      </Space>

      <Card variant="borderless">
        {posts.data && posts.data.items.length === 0 && !posts.loading ? (
          <EmptyState
            title="没有匹配的文章"
            action={
              <Link to="/admin/posts/new">
                <Button type="primary">新建文章</Button>
              </Link>
            }
          />
        ) : (
          <Table<PostSummary>
            rowKey="id"
            size="middle"
            loading={posts.loading}
            dataSource={posts.data?.items ?? []}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total: posts.data?.total ?? 0,
              showSizeChanger: false,
              onChange: setPage,
            }}
            columns={[
              {
                title: '标题',
                dataIndex: 'title',
                render: (title: string, record) => (
                  <Space direction="vertical" size={2}>
                    <Link to={`/admin/posts/${record.id}`} style={{ fontWeight: 500 }}>
                      {title}
                    </Link>
                    <Space size={6} wrap>
                      {record.tags.map((tag) => (
                        <Tag key={tag} bordered={false}>
                          {tag}
                        </Tag>
                      ))}
                    </Space>
                  </Space>
                ),
              },
              {
                title: '状态',
                dataIndex: 'status',
                width: 100,
                render: (value: PostStatus) => (
                  <Tag className={`tag-status${value === 'published' ? ' tag-status--published' : ''}`}>
                    {value === 'published' ? '已发布' : '草稿'}
                  </Tag>
                ),
              },
              { title: '阅读', dataIndex: 'views', width: 80 },
              {
                title: '发布时间',
                dataIndex: 'publishedAt',
                width: 120,
                render: (value: string | null) => formatDate(value),
              },
              {
                title: '更新',
                dataIndex: 'updatedAt',
                width: 120,
                render: (value: string) => formatDate(value),
              },
              {
                title: '操作',
                width: 150,
                render: (_, record) => (
                  <Space size={4}>
                    <Button
                      size="small"
                      type="text"
                      icon={<EditOutlined />}
                      onClick={() => navigate(`/admin/posts/${record.id}`)}
                    >
                      编辑
                    </Button>
                    <Popconfirm
                      title="删除这篇文章？"
                      description="文章及其评论将一并删除，无法恢复。"
                      okText="删除"
                      okButtonProps={{ danger: true, loading: deletingID === record.id }}
                      cancelText="取消"
                      onConfirm={() => remove(record.id)}
                    >
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
          />
        )}
      </Card>
    </Space>
  )
}
