import { Tag } from 'antd'
import { Link } from 'react-router-dom'

// TagList 渲染文章标签，点击进入按标签筛选的列表页。
export function TagList({ tags }: { tags: string[] }) {
  if (!tags || tags.length === 0) {
    return null
  }
  return (
    <span className="tag-cloud" style={{ display: 'inline-flex' }}>
      {tags.map((tag) => (
        <Link key={tag} to={`/posts?tag=${encodeURIComponent(tag)}`}>
          <Tag className="tag-seal">{tag}</Tag>
        </Link>
      ))}
    </span>
  )
}
