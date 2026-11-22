import { Button, Card, Col, Row, Space, Statistic, Table, Tag, Typography } from 'antd'
import {
  CommentOutlined,
  EyeOutlined,
  FileTextOutlined,
  PlusOutlined,
  TagsOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import type { PostSummary } from '../../api/types'
import { useAsync } from '../../lib/useAsync'
import { formatDate } from '../../lib/format'
import { EmptyState } from '../../components/PostCard'

// DashboardPage 展示站点统计与最近文章。
export function DashboardPage() {
  const stats = useAsync((signal) => api.adminStats(signal), [])
  const recent = useAsync((signal) => api.adminListPosts({ page: 1, pageSize: 6 }, signal), [])

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            概览
          </Typography.Title>
          <Typography.Text type="secondary">站点内容与互动情况</Typography.Text>
        </div>
        <Link to="/admin/posts/new">
          <Button type="primary" icon={<PlusOutlined />}>
            写新文章
          </Button>
        </Link>
      </Space>

      <Row gutter={[16, 16]}>
        <Col xs={12} md={8} xl={4}>
          <Card variant="borderless">
            <Statistic title="已发布" value={stats.data?.posts ?? 0} prefix={<FileTextOutlined />} loading={stats.loading} />
          </Card>
        </Col>
        <Col xs={12} md={8} xl={4}>
          <Card variant="borderless">
            <Statistic title="草稿" value={stats.data?.drafts ?? 0} loading={stats.loading} />
          </Card>
        </Col>
        <Col xs={12} md={8} xl={4}>
          <Card variant="borderless">
            <Statistic title="评论" value={stats.data?.comments ?? 0} prefix={<CommentOutlined />} loading={stats.loading} />
          </Card>
        </Col>
        <Col xs={12} md={8} xl={4}>
          <Card variant="borderless">
            <Link to="/admin/comments?status=pending">
              <Statistic
                title="待审核"
                value={stats.data?.pending ?? 0}
                prefix={<WarningOutlined />}
                valueStyle={{ color: (stats.data?.pending ?? 0) > 0 ? '#d97706' : undefined }}
                loading={stats.loading}
              />
            </Link>
          </Card>
        </Col>
        <Col xs={12} md={8} xl={4}>
          <Card variant="borderless">
            <Statistic title="标签" value={stats.data?.tags ?? 0} prefix={<TagsOutlined />} loading={stats.loading} />
          </Card>
        </Col>
        <Col xs={12} md={8} xl={4}>
          <Card variant="borderless">
            <Statistic title="总阅读量" value={stats.data?.totalViews ?? 0} prefix={<EyeOutlined />} loading={stats.loading} />
          </Card>
        </Col>
      </Row>

      <Card
        variant="borderless"
        title="最近更新"
        extra={
          <Link to="/admin/posts">
            <Button size="small" type="link">
              全部文章 →
            </Button>
          </Link>
        }
      >
        {recent.data && recent.data.items.length === 0 ? (
          <EmptyState
            title="还没有文章"
            description="写点东西，让博客开始运转。"
            action={
              <Link to="/admin/posts/new">
                <Button type="primary" icon={<PlusOutlined />}>
                  写第一篇
                </Button>
              </Link>
            }
          />
        ) : (
          <Table<PostSummary>
            rowKey="id"
            size="middle"
            loading={recent.loading}
            pagination={false}
            dataSource={recent.data?.items ?? []}
            columns={[
              {
                title: '标题',
                dataIndex: 'title',
                render: (title: string, record) => <Link to={`/admin/posts/${record.id}`}>{title}</Link>,
              },
              {
                title: '状态',
                dataIndex: 'status',
                width: 100,
                render: (status: string) => (
                  <Tag className={`tag-status${status === 'published' ? ' tag-status--published' : ''}`}>
                    {status === 'published' ? '已发布' : '草稿'}
                  </Tag>
                ),
              },
              {
                title: '更新时间',
                dataIndex: 'updatedAt',
                width: 130,
                render: (value: string) => formatDate(value),
              },
            ]}
          />
        )}
      </Card>
    </Space>
  )
}
