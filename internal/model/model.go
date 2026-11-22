package model

import "time"

// PostStatus 表示文章发布状态。
type PostStatus string

const (
	PostDraft     PostStatus = "draft"
	PostPublished PostStatus = "published"
)

// Valid 判断状态取值是否在允许范围内。
func (s PostStatus) Valid() bool {
	return s == PostDraft || s == PostPublished
}

// CommentStatus 表示评论审核状态。
type CommentStatus string

const (
	CommentPending  CommentStatus = "pending"
	CommentApproved CommentStatus = "approved"
	CommentSpam     CommentStatus = "spam"
)

// Valid 判断状态取值是否在允许范围内。
func (s CommentStatus) Valid() bool {
	return s == CommentPending || s == CommentApproved || s == CommentSpam
}

// Post 是一篇文章的完整数据。ContentHTML 由 Markdown 渲染后持久化，
// 读取列表时不查询该字段以减小传输量。
type Post struct {
	ID          int64      `json:"id"`
	Title       string     `json:"title"`
	Slug        string     `json:"slug"`
	Summary     string     `json:"summary"`
	ContentMD   string     `json:"contentMd,omitempty"`
	ContentHTML string     `json:"contentHtml,omitempty"`
	Cover       string     `json:"cover"`
	Category    string     `json:"category"`
	Status      PostStatus `json:"status"`
	Featured    bool       `json:"featured"`
	Views       int64      `json:"views"`
	ReadingTime int        `json:"readingTime"`
	Tags        []string   `json:"tags"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
	PublishedAt *time.Time `json:"publishedAt"`
}

// PostSummary 用于列表和归档展示。
type PostSummary struct {
	ID          int64      `json:"id"`
	Title       string     `json:"title"`
	Slug        string     `json:"slug"`
	Summary     string     `json:"summary"`
	Cover       string     `json:"cover"`
	Category    string     `json:"category"`
	Status      PostStatus `json:"status"`
	Featured    bool       `json:"featured"`
	Views       int64      `json:"views"`
	ReadingTime int        `json:"readingTime"`
	Tags        []string   `json:"tags"`
	PublishedAt *time.Time `json:"publishedAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

// PostInput 是创建或更新文章时接受的字段。
type PostInput struct {
	Title    string     `json:"title"`
	Slug     string     `json:"slug"`
	Summary  string     `json:"summary"`
	Content  string     `json:"contentMd"`
	Cover    string     `json:"cover"`
	Category string     `json:"category"`
	Status   PostStatus `json:"status"`
	Featured bool       `json:"featured"`
	Tags     []string   `json:"tags"`
}

// Tag 是带文章数量的标签。
type Tag struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// Category 是带文章数量的分类。
type Category struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// ArchiveGroup 是按月归档的一组文章。
type ArchiveGroup struct {
	Month string        `json:"month"`
	Posts []PostSummary `json:"posts"`
}

// Comment 是访客评论。
type Comment struct {
	ID        int64         `json:"id"`
	PostID    int64         `json:"postId"`
	PostTitle string        `json:"postTitle,omitempty"`
	PostSlug  string        `json:"postSlug,omitempty"`
	Author    string        `json:"author"`
	Email     string        `json:"email,omitempty"`
	Website   string        `json:"website"`
	Content   string        `json:"content"`
	Status    CommentStatus `json:"status"`
	CreatedAt time.Time     `json:"createdAt"`
}

// CommentInput 是访客提交评论时的字段。
type CommentInput struct {
	Author  string `json:"author"`
	Email   string `json:"email"`
	Website string `json:"website"`
	Content string `json:"content"`
}

// Settings 是站点级可配置项。
// Verses 是首页卷首轮播的诗句，一行一句，空行忽略。
type Settings struct {
	Title       string `json:"title"`
	Subtitle    string `json:"subtitle"`
	Description string `json:"description"`
	Author      string `json:"author"`
	Avatar      string `json:"avatar"`
	Cover       string `json:"cover"`
	Footer      string `json:"footer"`
	GitHub      string `json:"github"`
	Email       string `json:"email"`
	ICP         string `json:"icp"`
	Verses      string `json:"verses"`
	CommentNeed bool   `json:"commentNeedReview"`
}

// DefaultVerses 是卷首诗句的初始内容。
const DefaultVerses = "北冥有鱼，其名为鲲。\n鹏之徙于南冥也，水击三千里。\n且夫水之积也不厚，则其负大舟也无力。\n天地与我并生，而万物与我为一。\n泉涸，鱼相与处于陆，相呴以湿，相濡以沫。"

// DefaultSettings 返回初始站点配置。
func DefaultSettings() Settings {
	return Settings{
		Title:       "晨间笔记",
		Subtitle:    "记录技术与生活的细枝末节",
		Description: "一个用 Go、SQLite 与 React 搭建的个人博客。",
		Author:      "站长",
		Footer:      "由 Go + SQLite + React 驱动",
		Verses:      DefaultVerses,
		CommentNeed: true,
	}
}

// PageResult 是分页列表的统一返回结构。
type PageResult[T any] struct {
	Items    []T `json:"items"`
	Total    int `json:"total"`
	Page     int `json:"page"`
	PageSize int `json:"pageSize"`
}

// PostDetail 是文章详情响应，附带上下篇导航。
type PostDetail struct {
	Post     *Post        `json:"post"`
	Previous *PostSummary `json:"previous"`
	Next     *PostSummary `json:"next"`
}

// Stats 是管理后台概览数据。
type Stats struct {
	Posts      int `json:"posts"`
	Drafts     int `json:"drafts"`
	Comments   int `json:"comments"`
	Pending    int `json:"pending"`
	Tags       int `json:"tags"`
	TotalViews int `json:"totalViews"`
}
