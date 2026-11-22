import { Col, Divider, Row, Space, Typography } from 'antd'
import { GithubOutlined, MailOutlined } from '@ant-design/icons'
import { useSite } from '../context/SiteContext'
import { useAsync } from '../lib/useAsync'
import { api } from '../api/client'

// AboutPage 展示站点与作者信息，排版取册页气质：竖排字印、留白与细线。
export function AboutPage() {
  const { site } = useSite()
  const settings = site?.settings
  const stats = useAsync((signal) => api.listPosts({ page: 1, pageSize: 1 }, signal), [])

  return (
    <div className="prose-page">
      <Row gutter={[36, 32]} align="middle">
        <Col xs={24} md={16}>
          <Typography.Title level={2} style={{ marginTop: 0 }}>
            关于 {settings?.title || '本站'}
          </Typography.Title>
          <Typography.Paragraph className="prose-quiet">
            {settings?.description || '这里是一个安静的个人角落，记录技术笔记与生活片段。'}
          </Typography.Paragraph>
          <Space size={16} wrap className="prose-stats">
            {stats.data && <span>已发布 {stats.data.total} 篇</span>}
            {site && <span>{site.tags.length} 个标签</span>}
            {site && <span>{site.categories.length} 个分类</span>}
          </Space>
          <Divider />
          <Space size={20} wrap className="prose-links">
            {settings?.github && (
              <a href={settings.github} target="_blank" rel="noreferrer noopener">
                <GithubOutlined /> GitHub
              </a>
            )}
            {settings?.email && (
              <a href={`mailto:${settings.email}`}>
                <MailOutlined /> {settings.email}
              </a>
            )}
            <a href="/rss.xml" target="_blank" rel="noreferrer noopener">
              RSS 订阅
            </a>
          </Space>
        </Col>
        <Col xs={24} md={8}>
          <div className="about-portrait">
            {settings?.avatar ? (
              <img className="about-portrait__image" src={settings.avatar} alt={settings.author || '作者头像'} />
            ) : (
              <div className="about-portrait__seal">
                {(settings?.author || settings?.title || '博').slice(0, 1)}
              </div>
            )}
            <div className="about-portrait__name">{settings?.author || '站长'}</div>
            <div className="about-portrait__motto">{settings?.subtitle || '乘物以游心'}</div>
          </div>
        </Col>
      </Row>

      <Divider />

      <Typography.Title level={4}>本站何来</Typography.Title>
      <Typography.Paragraph className="prose-quiet">
        本站由 Go 标准库提供 HTTP 服务，使用 SQLite 存储数据，前端基于 React、TypeScript 与 Ant Design，
        由 Vite 构建后内嵌进后端二进制。首页的水墨山峦、云雾与飞鸟都用 Canvas 实时绘制，
        背景清音由 Web Audio 现场合成，因此部署只需要一个可执行文件与一个数据目录。
      </Typography.Paragraph>

      <div className="about-quote">
        且夫水之积也不厚，则其负大舟也无力。
        <span>——《庄子 · 逍遥游》</span>
      </div>
    </div>
  )
}
