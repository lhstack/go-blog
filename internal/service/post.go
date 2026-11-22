package service

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"goblog/internal/markdown"
	"goblog/internal/model"
	"goblog/internal/store"
)

// reservedSlugs 是已被前端路由占用的路径，文章别名不能与之冲突。
var reservedSlugs = map[string]struct{}{
	"admin": {}, "api": {}, "login": {}, "posts": {}, "tags": {}, "categories": {},
	"archive": {}, "about": {}, "search": {}, "uploads": {}, "rss": {}, "sitemap": {},
	"new": {}, "edit": {},
}

var (
	slugAllowed = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
	slugStrip   = regexp.MustCompile(`[^a-z0-9]+`)
)

// PostService 承载文章的校验、渲染与查询编排。
type PostService struct {
	posts  *store.PostStore
	tags   *store.TagStore
	render *markdown.Renderer
	now    func() time.Time
}

// NewPostService 构造文章服务。
func NewPostService(posts *store.PostStore, tags *store.TagStore, renderer *markdown.Renderer) *PostService {
	return &PostService{posts: posts, tags: tags, render: renderer, now: func() time.Time { return time.Now().UTC() }}
}

// Create 校验并写入新文章。
func (s *PostService) Create(ctx context.Context, input model.PostInput) (*model.Post, error) {
	post, err := s.prepare(ctx, 0, input)
	if err != nil {
		return nil, err
	}
	id, err := s.posts.Create(ctx, post)
	if err != nil {
		return nil, err
	}
	return s.posts.GetByID(ctx, id)
}

// Update 校验并覆盖更新文章。
func (s *PostService) Update(ctx context.Context, id int64, input model.PostInput) (*model.Post, error) {
	existing, err := s.posts.GetByID(ctx, id)
	if errors.Is(err, store.ErrNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	post, err := s.prepare(ctx, existing.ID, input)
	if err != nil {
		return nil, err
	}
	post.ID = existing.ID
	post.CreatedAt = existing.CreatedAt
	post.Views = existing.Views
	// 已发布文章再次保存时保留原发布时间，避免修改内容导致文章跳到列表最前。
	post.PublishedAt = existing.PublishedAt
	if post.Status == model.PostPublished && post.PublishedAt == nil {
		publishedAt := s.now()
		post.PublishedAt = &publishedAt
	}
	if post.Status == model.PostDraft {
		post.PublishedAt = nil
	}

	if err := s.posts.Update(ctx, post); err != nil {
		return nil, err
	}
	if err := s.tags.DeleteUnused(ctx); err != nil {
		return nil, err
	}
	return s.posts.GetByID(ctx, existing.ID)
}

// Delete 删除文章。
func (s *PostService) Delete(ctx context.Context, id int64) error {
	if err := s.posts.Delete(ctx, id); errors.Is(err, store.ErrNotFound) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	return s.tags.DeleteUnused(ctx)
}

// AdminGet 返回管理端可见的任意文章。
func (s *PostService) AdminGet(ctx context.Context, id int64) (*model.Post, error) {
	post, err := s.posts.GetByID(ctx, id)
	if errors.Is(err, store.ErrNotFound) {
		return nil, ErrNotFound
	}
	return post, err
}

// PublicDetail 返回已发布文章详情，并累加阅读量、附带相邻文章。
func (s *PostService) PublicDetail(ctx context.Context, slug string) (*model.PostDetail, error) {
	post, err := s.posts.GetPublishedBySlug(ctx, slug)
	if errors.Is(err, store.ErrNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	previous, next, err := s.posts.Adjacent(ctx, post)
	if err != nil {
		return nil, err
	}
	if err := s.posts.IncrementViews(ctx, post.ID); err != nil {
		return nil, err
	}
	post.Views++

	return &model.PostDetail{Post: post, Previous: previous, Next: next}, nil
}

// PublicList 返回前台文章列表，强制只包含已发布内容。
func (s *PostService) PublicList(ctx context.Context, filter store.PostFilter) (*model.PageResult[model.PostSummary], error) {
	filter.Status = model.PostPublished
	return s.posts.List(ctx, filter)
}

// AdminList 返回后台列表，可按状态筛选。
func (s *PostService) AdminList(ctx context.Context, filter store.PostFilter) (*model.PageResult[model.PostSummary], error) {
	return s.posts.List(ctx, filter)
}

// Archive 返回按月份分组的已发布文章。
func (s *PostService) Archive(ctx context.Context) ([]model.ArchiveGroup, error) {
	return s.posts.Archive(ctx)
}

// Tags 返回标签聚合。
func (s *PostService) Tags(ctx context.Context) ([]model.Tag, error) {
	return s.tags.List(ctx)
}

// Categories 返回分类聚合。
func (s *PostService) Categories(ctx context.Context) ([]model.Category, error) {
	return s.tags.Categories(ctx)
}

// Stats 返回后台概览数据。
func (s *PostService) Stats(ctx context.Context) (*model.Stats, error) {
	return s.posts.Stats(ctx)
}

// prepare 完成字段校验、别名确认、渲染与时间戳设置。
func (s *PostService) prepare(ctx context.Context, excludeID int64, input model.PostInput) (*model.Post, error) {
	collector := &fieldCollector{}

	title := required(collector, "title", input.Title, "请输入文章标题", 120)
	content := strings.TrimSpace(input.Content)
	if content == "" {
		collector.add("contentMd", "请输入文章正文")
	}
	status := input.Status
	if status == "" {
		status = model.PostDraft
	}
	if !status.Valid() {
		collector.add("status", "状态只能是 draft 或 published")
	}
	category := optional(collector, "category", input.Category, 40)
	cover := optional(collector, "cover", input.Cover, 500)
	summary := optional(collector, "summary", input.Summary, 300)

	tags, err := normalizeTags(collector, input.Tags)
	if err != nil {
		return nil, err
	}

	slug, err := s.resolveSlug(ctx, collector, input.Slug, title, excludeID)
	if err != nil {
		return nil, err
	}
	if err := collector.err(); err != nil {
		return nil, err
	}

	html, err := s.render.Render(content)
	if err != nil {
		return nil, err
	}
	if summary == "" {
		summary = markdown.Excerpt(content, 120)
	}

	now := s.now()
	post := &model.Post{
		Title:       title,
		Slug:        slug,
		Summary:     summary,
		ContentMD:   content,
		ContentHTML: html,
		Cover:       cover,
		Category:    category,
		Status:      status,
		Featured:    input.Featured,
		ReadingTime: markdown.ReadingTime(content),
		Tags:        tags,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if status == model.PostPublished {
		post.PublishedAt = &now
	}
	return post, nil
}

// resolveSlug 采用显式别名或由标题生成，并检查唯一性与系统路径冲突。
// 自动生成（含中文标题回退）时遇到占用会自动追加序号，手写别名则直接报错。
func (s *PostService) resolveSlug(ctx context.Context, collector *fieldCollector, raw, title string, excludeID int64) (string, error) {
	explicit := strings.TrimSpace(raw) != ""
	slug := strings.ToLower(strings.TrimSpace(raw))
	if slug == "" {
		slug = slugify(title)
	}
	if slug == "" {
		// 标题全为中文等非 ASCII 字符时无法生成有意义的英文别名，回退到时间戳。
		slug = fmt.Sprintf("post-%d", s.now().Unix())
	}
	if !slugAllowed.MatchString(slug) {
		collector.add("slug", "只能使用小写字母、数字与连字符")
		return "", nil
	}
	if _, reserved := reservedSlugs[slug]; reserved {
		collector.add("slug", "该地址为系统保留路径，请更换")
		return "", nil
	}

	candidate := slug
	for suffix := 2; suffix <= 99; suffix++ {
		taken, err := s.posts.SlugTaken(ctx, candidate, excludeID)
		if err != nil {
			return "", err
		}
		if !taken {
			return candidate, nil
		}
		if explicit {
			collector.add("slug", "该地址已被其它文章使用")
			return "", nil
		}
		candidate = fmt.Sprintf("%s-%d", slug, suffix)
	}
	collector.add("slug", "无法生成唯一地址，请手动指定")
	return "", nil
}

// slugify 把标题转换为 kebab-case；非 ASCII 字符会被丢弃。
func slugify(title string) string {
	lower := strings.ToLower(strings.TrimSpace(title))
	slug := slugStrip.ReplaceAllString(lower, "-")
	return strings.Trim(slug, "-")
}

func normalizeTags(collector *fieldCollector, raw []string) ([]string, error) {
	tags := make([]string, 0, len(raw))
	seen := make(map[string]struct{}, len(raw))
	for _, item := range raw {
		name := strings.TrimSpace(item)
		if name == "" {
			continue
		}
		if len([]rune(name)) > 24 {
			collector.add("tags", "单个标签不能超过 24 个字符")
			continue
		}
		key := strings.ToLower(name)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		tags = append(tags, name)
	}
	if len(tags) > 8 {
		collector.add("tags", "最多设置 8 个标签")
	}
	return tags, nil
}
