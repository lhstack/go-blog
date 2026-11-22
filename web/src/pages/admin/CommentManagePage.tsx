import { useState } from 'react'
import {
  Button,
  Card,
  Popconfirm,
  Segmented,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { CheckOutlined, DeleteOutlined, StopOutlined } from '@ant-design/icons'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../api/client'
import type { Comment, CommentStatus } from '../../api/types'
import { useAsync } from '../../lib/useAsync'
import { formatDateTime } from '../../lib/format'

const PAGE_SIZE = 20

// CommentManagePage 审核与删除评论。
export function CommentManagePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [busyID, setBusyID] = useState<number | null>(null)
  const status = (searchParams.get('status') ?? '') as CommentStatus | ''

  const comments = useAsync(
    (signal) => api.adminListComments({ page, pageSize: PAGE_SIZE, status: status || '' }, signal),
    [page, status],
  )

  const changeStatus = async (id: number, next: CommentStatus) => {
    setBusyID(id)
    try {
      await api.adminModerateComment(id, next)
      message.success(next === 'approved' ? '已通过' : next === 'spam' ? '已标记为垃圾' : '已转为待审')
      comments.reload()
    } catch (err) {
      message.error(err instanceof Error ? err.message : '操作失败')
    } finally {
      setBusyID(null)
    }
  }

  const remove = async (id: number) => {
    setBusyID(id)
    try {
      await api.adminDeleteComment(id)
      message.success('评论已删除')
      comments.reload()
    } catch (err) {
      message.error(err instanceof Error ? err.message : '删除失败')
    } finally {
      setBusyID(null)
    }
  }

  return (
    <Space direction="vertical" size={18} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            评论
          </Typography.Title>
          <Typography.Text type="secondary">共 {comments.data?.total ?? 0} 条</Typography.Text>
        </div>
        <Segmented
          value={status || 'all'}
          onChange={(value) => {
            setPage(1)
            const next = new URLSearchParams(searchParams)
            if (value === 'all') {
              next.delete('status')
            } else {
              next.set('status', String(value))
            }
            setSearchParams(next)
          }}
          options={[
            { label: '全部', value: 'all' },
            { label: '待审核', value: 'pending' },
            { label: '已通过', value: 'approved' },
            { label: '垃圾', value: 'spam' },
          ]}
        />
      </Space>

      <Card variant="borderless">
        <Table<Comment>
          rowKey="id"
          size="middle"
          loading={comments.loading}
          dataSource={comments.data?.items ?? []}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: comments.data?.total ?? 0,
            showSizeChanger: false,
            onChange: setPage,
          }}
          columns={[
            {
              title: '评论者',
              width: 190,
              render: (_, record) => (
                <Space>
                  <span className="comment__seal" aria-hidden="true">
                    {record.author.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <div style={{ fontWeight: 500 }}>{record.author}</div>
                    <div className="admin-meta-text">{record.email || '未留邮箱'}</div>
                  </div>
                </Space>
              ),
            },
            {
              title: '内容',
              render: (_, record) => (
                <div>
                  <Typography.Paragraph
                    style={{ marginBottom: 4, whiteSpace: 'pre-wrap' }}
                    ellipsis={{ rows: 3, expandable: false }}
                  >
                    {record.content}
                  </Typography.Paragraph>
                  <Space size={8} wrap style={{ fontSize: 12.5 }}>
                    <Typography.Text type="secondary">
                      于{' '}
                      {record.postSlug ? (
                        <Link to={`/posts/${record.postSlug}`} target="_blank">
                          {record.postTitle}
                        </Link>
                      ) : (
                        record.postTitle
                      )}
                    </Typography.Text>
                    <Typography.Text type="secondary">{formatDateTime(record.createdAt)}</Typography.Text>
                    <Tag
                      className={`tag-status${record.status === 'approved' ? ' tag-status--published' : ''}`}
                    >
                      {record.status === 'approved' ? '已通过' : record.status === 'pending' ? '待审核' : '垃圾'}
                    </Tag>
                  </Space>
                </div>
              ),
            },
            {
              title: '操作',
              width: 168,
              render: (_, record) => (
                <Space size={2} wrap>
                  {record.status !== 'approved' && (
                    <Button
                      size="small"
                      type="text"
                      icon={<CheckOutlined />}
                      loading={busyID === record.id}
                      onClick={() => changeStatus(record.id, 'approved')}
                    >
                      通过
                    </Button>
                  )}
                  {record.status !== 'spam' && (
                    <Button
                      size="small"
                      type="text"
                      icon={<StopOutlined />}
                      loading={busyID === record.id}
                      onClick={() => changeStatus(record.id, 'spam')}
                    >
                      垃圾
                    </Button>
                  )}
                  <Popconfirm
                    title="删除这条评论？"
                    okText="删除"
                    okButtonProps={{ danger: true }}
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
      </Card>
    </Space>
  )
}
