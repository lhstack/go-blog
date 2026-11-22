import type {
  ApiErrorBody,
  ArchiveGroup,
  Category,
  Comment,
  CommentInput,
  CommentStatus,
  PageResult,
  Post,
  PostDetail,
  PostInput,
  PostStatus,
  PostSummary,
  Profile,
  Session,
  Settings,
  SiteInfo,
  Stats,
  Tag,
  UploadResult,
} from './types'

const TOKEN_KEY = 'goblog.token'

// ApiError 保留后端返回的字段级校验信息，方便表单精确回显。
export class ApiError extends Error {
  readonly status: number
  readonly fields: Record<string, string>

  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fields = fields
  }
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? ''
}

export function setToken(token: string): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

interface RequestOptions {
  method?: string
  body?: unknown
  auth?: boolean
  signal?: AbortSignal
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = false, signal } = options
  const headers: Record<string, string> = {}
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (auth) {
    const token = getToken()
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
  }

  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  const payload = text ? safeParse(text) : null

  if (!response.ok) {
    const errorBody = (payload ?? {}) as ApiErrorBody
    const message = errorBody.message || `请求失败（${response.status}）`
    if (response.status === 401 && auth) {
      setToken('')
    }
    throw new ApiError(response.status, message, errorBody.fields ?? {})
  }

  return payload as T
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '' || value === false) {
      continue
    }
    search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

export interface PostQuery {
  page?: number
  pageSize?: number
  category?: string
  tag?: string
  q?: string
  featured?: boolean
  status?: PostStatus | ''
}

export const api = {
  getSite: (signal?: AbortSignal) => request<SiteInfo>('/api/site', { signal }),

  listPosts: (query: PostQuery = {}, signal?: AbortSignal) =>
    request<PageResult<PostSummary>>(`/api/posts${buildQuery({ ...query })}`, { signal }),

  getPost: (slug: string, signal?: AbortSignal) =>
    request<PostDetail>(`/api/posts/${encodeURIComponent(slug)}`, { signal }),

  listComments: (slug: string, signal?: AbortSignal) =>
    request<{ items: Comment[] }>(`/api/posts/${encodeURIComponent(slug)}/comments`, { signal }),

  createComment: (slug: string, input: CommentInput) =>
    request<{ comment: Comment; visible: boolean; message: string }>(
      `/api/posts/${encodeURIComponent(slug)}/comments`,
      { method: 'POST', body: input },
    ),

  listTags: (signal?: AbortSignal) => request<{ items: Tag[] }>('/api/tags', { signal }),

  listCategories: (signal?: AbortSignal) =>
    request<{ items: Category[] }>('/api/categories', { signal }),

  listArchive: (signal?: AbortSignal) =>
    request<{ items: ArchiveGroup[] }>('/api/archive', { signal }),

  recentComments: (limit = 5, signal?: AbortSignal) =>
    request<{ items: Comment[] }>(`/api/comments/recent?limit=${limit}`, { signal }),

  login: (username: string, password: string) =>
    request<Session>('/api/auth/login', { method: 'POST', body: { username, password } }),

  me: (signal?: AbortSignal) => request<Profile>('/api/auth/me', { auth: true, signal }),

  changePassword: (oldPassword: string, newPassword: string) =>
    request<void>('/api/auth/password', {
      method: 'POST',
      auth: true,
      body: { oldPassword, newPassword },
    }),

  adminStats: (signal?: AbortSignal) =>
    request<Stats>('/api/admin/stats', { auth: true, signal }),

  adminListPosts: (query: PostQuery = {}, signal?: AbortSignal) =>
    request<PageResult<PostSummary>>(`/api/admin/posts${buildQuery({ ...query })}`, {
      auth: true,
      signal,
    }),

  adminGetPost: (id: number, signal?: AbortSignal) =>
    request<Post>(`/api/admin/posts/${id}`, { auth: true, signal }),

  adminCreatePost: (input: PostInput) =>
    request<Post>('/api/admin/posts', { method: 'POST', auth: true, body: input }),

  adminUpdatePost: (id: number, input: PostInput) =>
    request<Post>(`/api/admin/posts/${id}`, { method: 'PUT', auth: true, body: input }),

  adminDeletePost: (id: number) =>
    request<void>(`/api/admin/posts/${id}`, { method: 'DELETE', auth: true }),

  adminListComments: (
    query: { page?: number; pageSize?: number; status?: CommentStatus | ''; postId?: number } = {},
    signal?: AbortSignal,
  ) =>
    request<PageResult<Comment>>(`/api/admin/comments${buildQuery({ ...query })}`, {
      auth: true,
      signal,
    }),

  adminModerateComment: (id: number, status: CommentStatus) =>
    request<void>(`/api/admin/comments/${id}`, {
      method: 'PATCH',
      auth: true,
      body: { status },
    }),

  adminDeleteComment: (id: number) =>
    request<void>(`/api/admin/comments/${id}`, { method: 'DELETE', auth: true }),

  adminGetSettings: (signal?: AbortSignal) =>
    request<Settings>('/api/admin/settings', { auth: true, signal }),

  adminSaveSettings: (settings: Settings) =>
    request<Settings>('/api/admin/settings', { method: 'PUT', auth: true, body: settings }),

  adminUpload: async (file: File): Promise<UploadResult> => {
    const form = new FormData()
    form.append('file', file)
    const token = getToken()
    const response = await fetch('/api/admin/uploads', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    })
    const text = await response.text()
    const payload = text ? safeParse(text) : null
    if (!response.ok) {
      const errorBody = (payload ?? {}) as ApiErrorBody
      throw new ApiError(
        response.status,
        errorBody.message || '上传失败',
        errorBody.fields ?? {},
      )
    }
    return payload as UploadResult
  },
}
