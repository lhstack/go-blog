// 后端 API 的数据契约。字段与 internal/model 中的 JSON 结构一一对应。

export type PostStatus = 'draft' | 'published'
export type CommentStatus = 'pending' | 'approved' | 'spam'

export interface PostSummary {
  id: number
  title: string
  slug: string
  summary: string
  cover: string
  category: string
  status: PostStatus
  featured: boolean
  views: number
  readingTime: number
  tags: string[]
  publishedAt: string | null
  updatedAt: string
}

export interface Post extends PostSummary {
  contentMd: string
  contentHtml: string
  createdAt: string
}

export interface PostDetail {
  post: Post
  previous: PostSummary | null
  next: PostSummary | null
}

export interface PostInput {
  title: string
  slug: string
  summary: string
  contentMd: string
  cover: string
  category: string
  status: PostStatus
  featured: boolean
  tags: string[]
}

export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface Tag {
  name: string
  count: number
}

export interface Category {
  name: string
  count: number
}

export interface ArchiveGroup {
  month: string
  posts: PostSummary[]
}

export interface Comment {
  id: number
  postId: number
  postTitle?: string
  postSlug?: string
  author: string
  email?: string
  website: string
  content: string
  status: CommentStatus
  createdAt: string
}

export interface CommentInput {
  author: string
  email: string
  website: string
  content: string
}

export interface Settings {
  title: string
  subtitle: string
  description: string
  author: string
  avatar: string
  cover: string
  footer: string
  github: string
  email: string
  icp: string
  verses: string
  commentNeedReview: boolean
}

export interface SiteInfo {
  settings: Settings
  tags: Tag[]
  categories: Category[]
}

export interface Session {
  token: string
  expiresAt: string
  username: string
  displayName: string
}

export interface Profile {
  id: number
  username: string
  displayName: string
  createdAt: string
}

export interface Stats {
  posts: number
  drafts: number
  comments: number
  pending: number
  tags: number
  totalViews: number
}

export interface UploadResult {
  url: string
  name: string
  size: number
}

export interface ApiErrorBody {
  message: string
  fields?: Record<string, string>
}
