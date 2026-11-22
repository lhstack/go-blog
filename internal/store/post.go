package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"goblog/internal/model"
)

// ErrNotFound 表示目标记录不存在，供上层映射为 404。
var ErrNotFound = errors.New("记录不存在")

// Store 汇聚全部数据访问对象。
type Store struct {
	db   *sql.DB
	Post *PostStore
	Tag  *TagStore
	Cmt  *CommentStore
	User *UserStore
	Conf *SettingsStore
}

// New 构造 Store。
func New(db *sql.DB) *Store {
	return &Store{
		db:   db,
		Post: &PostStore{db: db},
		Tag:  &TagStore{db: db},
		Cmt:  &CommentStore{db: db},
		User: &UserStore{db: db},
		Conf: &SettingsStore{db: db},
	}
}

// DB 暴露底层连接，供测试与事务型服务使用。
func (s *Store) DB() *sql.DB { return s.db }

// timeLayout 是数据库中统一使用的时间文本格式。
const timeLayout = time.RFC3339

func formatTime(t time.Time) string {
	return t.UTC().Format(timeLayout)
}

func formatNullTime(t *time.Time) any {
	if t == nil {
		return nil
	}
	return formatTime(*t)
}

func parseTime(raw string) (time.Time, error) {
	t, err := time.Parse(timeLayout, raw)
	if err != nil {
		return time.Time{}, fmt.Errorf("解析时间 %q: %w", raw, err)
	}
	return t, nil
}

func parseNullTime(raw *string) (*time.Time, error) {
	if raw == nil || *raw == "" {
		return nil, nil
	}
	t, err := parseTime(*raw)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func placeholders(n int) string {
	if n <= 0 {
		return ""
	}
	return strings.TrimSuffix(strings.Repeat("?,", n), ",")
}

// PostFilter 描述文章列表的查询条件。
type PostFilter struct {
	Status   model.PostStatus // 为空表示不限（仅管理端使用）
	Category string
	Tag      string
	Query    string
	Featured bool
	Page     int
	PageSize int
}

func (f *PostFilter) normalize() {
	if f.Page < 1 {
		f.Page = 1
	}
	if f.PageSize < 1 || f.PageSize > 100 {
		f.PageSize = 10
	}
}

// PostStore 负责文章与其标签关联的读写。
type PostStore struct {
	db *sql.DB
}

const postColumns = `id, title, slug, summary, content_md, content_html, cover, category,
	status, featured, views, reading_time, created_at, updated_at, published_at`

// Create 在单个事务内写入文章与标签，返回新文章 ID。
func (s *PostStore) Create(ctx context.Context, post *model.Post) (int64, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("开始事务: %w", err)
	}
	defer tx.Rollback()

	res, err := tx.ExecContext(ctx, `
		INSERT INTO posts (title, slug, summary, content_md, content_html, cover, category,
			status, featured, views, reading_time, created_at, updated_at, published_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		post.Title, post.Slug, post.Summary, post.ContentMD, post.ContentHTML, post.Cover,
		post.Category, string(post.Status), boolToInt(post.Featured), post.Views, post.ReadingTime,
		formatTime(post.CreatedAt), formatTime(post.UpdatedAt), formatNullTime(post.PublishedAt),
	)
	if err != nil {
		return 0, fmt.Errorf("写入文章: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("读取文章 ID: %w", err)
	}
	if err := replaceTags(ctx, tx, id, post.Tags); err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("提交事务: %w", err)
	}
	return id, nil
}

// Update 覆盖式更新文章与标签。
func (s *PostStore) Update(ctx context.Context, post *model.Post) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("开始事务: %w", err)
	}
	defer tx.Rollback()

	res, err := tx.ExecContext(ctx, `
		UPDATE posts SET title = ?, slug = ?, summary = ?, content_md = ?, content_html = ?,
			cover = ?, category = ?, status = ?, featured = ?, reading_time = ?,
			updated_at = ?, published_at = ?
		WHERE id = ?`,
		post.Title, post.Slug, post.Summary, post.ContentMD, post.ContentHTML, post.Cover,
		post.Category, string(post.Status), boolToInt(post.Featured), post.ReadingTime,
		formatTime(post.UpdatedAt), formatNullTime(post.PublishedAt), post.ID,
	)
	if err != nil {
		return fmt.Errorf("更新文章: %w", err)
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("检查更新结果: %w", err)
	}
	if affected == 0 {
		return ErrNotFound
	}
	if err := replaceTags(ctx, tx, post.ID, post.Tags); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("提交事务: %w", err)
	}
	return nil
}

// Delete 删除文章，标签关联随外键级联删除。
func (s *PostStore) Delete(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM posts WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("删除文章: %w", err)
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("检查删除结果: %w", err)
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

// GetByID 返回任意状态的文章详情，供管理端使用。
func (s *PostStore) GetByID(ctx context.Context, id int64) (*model.Post, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+postColumns+` FROM posts WHERE id = ?`, id)
	post, err := scanPost(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("查询文章: %w", err)
	}
	if err := s.attachTags(ctx, []*model.Post{post}); err != nil {
		return nil, err
	}
	return post, nil
}

// GetPublishedBySlug 只返回已发布文章，未发布内容对访客不可见。
func (s *PostStore) GetPublishedBySlug(ctx context.Context, slug string) (*model.Post, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT `+postColumns+` FROM posts WHERE slug = ? AND status = 'published'`, slug)
	post, err := scanPost(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("查询文章: %w", err)
	}
	if err := s.attachTags(ctx, []*model.Post{post}); err != nil {
		return nil, err
	}
	return post, nil
}

// SlugTaken 判断别名是否已被其它文章占用，excludeID 为 0 表示新建场景。
func (s *PostStore) SlugTaken(ctx context.Context, slug string, excludeID int64) (bool, error) {
	var count int
	err := s.db.QueryRowContext(ctx,
		`SELECT count(*) FROM posts WHERE slug = ? AND id <> ?`, slug, excludeID).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("检查别名: %w", err)
	}
	return count > 0, nil
}

// List 按条件分页查询文章摘要。
func (s *PostStore) List(ctx context.Context, filter PostFilter) (*model.PageResult[model.PostSummary], error) {
	filter.normalize()
	where, args := filter.conditions()

	total, err := s.count(ctx, where, args)
	if err != nil {
		return nil, err
	}

	query := `SELECT p.id, p.title, p.slug, p.summary, p.cover, p.category, p.status,
			p.featured, p.views, p.reading_time, p.updated_at, p.published_at
		FROM posts p` + where + ` ORDER BY ` + filter.orderBy() + ` LIMIT ? OFFSET ?`
	args = append(args, filter.PageSize, (filter.Page-1)*filter.PageSize)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("查询文章列表: %w", err)
	}
	defer rows.Close()

	posts := make([]model.PostSummary, 0, filter.PageSize)
	ids := make([]int64, 0, filter.PageSize)
	for rows.Next() {
		post, err := scanPostSummary(rows)
		if err != nil {
			return nil, fmt.Errorf("读取文章行: %w", err)
		}
		posts = append(posts, *post)
		ids = append(ids, post.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历文章列表: %w", err)
	}

	tagMap, err := s.tagsFor(ctx, ids)
	if err != nil {
		return nil, err
	}
	for i := range posts {
		posts[i].Tags = tagMap[posts[i].ID]
		if posts[i].Tags == nil {
			posts[i].Tags = []string{}
		}
	}

	return &model.PageResult[model.PostSummary]{
		Items:    posts,
		Total:    total,
		Page:     filter.Page,
		PageSize: filter.PageSize,
	}, nil
}

func (f PostFilter) conditions() (string, []any) {
	clauses := make([]string, 0, 4)
	args := make([]any, 0, 4)

	if f.Status != "" {
		clauses = append(clauses, "p.status = ?")
		args = append(args, string(f.Status))
	}
	if f.Category != "" {
		clauses = append(clauses, "p.category = ?")
		args = append(args, f.Category)
	}
	if f.Featured {
		clauses = append(clauses, "p.featured = 1")
	}
	if f.Tag != "" {
		clauses = append(clauses,
			`p.id IN (SELECT pt.post_id FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE t.name = ?)`)
		args = append(args, f.Tag)
	}
	if f.Query != "" {
		clauses = append(clauses, `(p.title LIKE ? OR p.summary LIKE ? OR p.content_md LIKE ?)`)
		like := "%" + f.Query + "%"
		args = append(args, like, like, like)
	}
	if len(clauses) == 0 {
		return "", args
	}
	return " WHERE " + strings.Join(clauses, " AND "), args
}

func (f PostFilter) orderBy() string {
	if f.Query != "" {
		// 搜索场景优先按更新时间，避免草稿排在已发布内容之前造成困惑。
		return "p.updated_at DESC, p.id DESC"
	}
	return "COALESCE(p.published_at, p.updated_at) DESC, p.id DESC"
}

func (s *PostStore) count(ctx context.Context, where string, args []any) (int, error) {
	var total int
	query := `SELECT count(*) FROM posts p` + where
	if err := s.db.QueryRowContext(ctx, query, args...).Scan(&total); err != nil {
		return 0, fmt.Errorf("统计文章数量: %w", err)
	}
	return total, nil
}

// IncrementViews 原子累加阅读量。
func (s *PostStore) IncrementViews(ctx context.Context, id int64) error {
	_, err := s.db.ExecContext(ctx, `UPDATE posts SET views = views + 1 WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("累加阅读量: %w", err)
	}
	return nil
}

// Adjacent 返回相邻的已发布文章摘要，用于详情页上下篇导航。
func (s *PostStore) Adjacent(ctx context.Context, post *model.Post) (*model.PostSummary, *model.PostSummary, error) {
	if post.PublishedAt == nil {
		return nil, nil, nil
	}
	published := formatTime(*post.PublishedAt)

	prev, err := s.adjacentOne(ctx,
		`SELECT p.id, p.title, p.slug, p.summary, p.cover, p.category, p.status, p.featured,
			p.views, p.reading_time, p.updated_at, p.published_at
		 FROM posts p
		 WHERE p.status = 'published' AND (p.published_at > ? OR (p.published_at = ? AND p.id > ?))
		 ORDER BY p.published_at ASC, p.id ASC LIMIT 1`, published, published, post.ID)
	if err != nil {
		return nil, nil, err
	}

	next, err := s.adjacentOne(ctx,
		`SELECT p.id, p.title, p.slug, p.summary, p.cover, p.category, p.status, p.featured,
			p.views, p.reading_time, p.updated_at, p.published_at
		 FROM posts p
		 WHERE p.status = 'published' AND (p.published_at < ? OR (p.published_at = ? AND p.id < ?))
		 ORDER BY p.published_at DESC, p.id DESC LIMIT 1`, published, published, post.ID)
	if err != nil {
		return nil, nil, err
	}
	return prev, next, nil
}

func (s *PostStore) adjacentOne(ctx context.Context, query string, args ...any) (*model.PostSummary, error) {
	row := s.db.QueryRowContext(ctx, query, args...)
	post, err := scanPostSummary(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("查询相邻文章: %w", err)
	}
	return post, nil
}

// Archive 按月返回已发布文章。
func (s *PostStore) Archive(ctx context.Context) ([]model.ArchiveGroup, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT p.id, p.title, p.slug, p.summary, p.cover, p.category, p.status, p.featured,
			p.views, p.reading_time, p.updated_at, p.published_at
		FROM posts p
		WHERE p.status = 'published'
		ORDER BY p.published_at DESC, p.id DESC`)
	if err != nil {
		return nil, fmt.Errorf("查询归档: %w", err)
	}
	defer rows.Close()

	groups := make([]model.ArchiveGroup, 0, 12)
	index := make(map[string]int, 12)
	ids := make([]int64, 0, 64)
	for rows.Next() {
		post, err := scanPostSummary(rows)
		if err != nil {
			return nil, fmt.Errorf("读取归档行: %w", err)
		}
		month := "未发布"
		if post.PublishedAt != nil {
			month = post.PublishedAt.Format("2006-01")
		}
		position, ok := index[month]
		if !ok {
			groups = append(groups, model.ArchiveGroup{Month: month, Posts: []model.PostSummary{}})
			position = len(groups) - 1
			index[month] = position
		}
		groups[position].Posts = append(groups[position].Posts, *post)
		ids = append(ids, post.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历归档: %w", err)
	}

	tagMap, err := s.tagsFor(ctx, ids)
	if err != nil {
		return nil, err
	}
	for gi := range groups {
		for pi := range groups[gi].Posts {
			tags := tagMap[groups[gi].Posts[pi].ID]
			if tags == nil {
				tags = []string{}
			}
			groups[gi].Posts[pi].Tags = tags
		}
	}
	return groups, nil
}

// Stats 汇总管理后台概览数据。
func (s *PostStore) Stats(ctx context.Context) (*model.Stats, error) {
	stats := &model.Stats{}
	row := s.db.QueryRowContext(ctx, `
		SELECT
			COALESCE(SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(views), 0)
		FROM posts`)
	if err := row.Scan(&stats.Posts, &stats.Drafts, &stats.TotalViews); err != nil {
		return nil, fmt.Errorf("统计文章: %w", err)
	}
	if err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM comments`).Scan(&stats.Comments); err != nil {
		return nil, fmt.Errorf("统计评论: %w", err)
	}
	if err := s.db.QueryRowContext(ctx,
		`SELECT count(*) FROM comments WHERE status = 'pending'`).Scan(&stats.Pending); err != nil {
		return nil, fmt.Errorf("统计待审评论: %w", err)
	}
	if err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM tags`).Scan(&stats.Tags); err != nil {
		return nil, fmt.Errorf("统计标签: %w", err)
	}
	return stats, nil
}

type scanner interface {
	Scan(dest ...any) error
}

func scanPost(row scanner) (*model.Post, error) {
	var (
		post        model.Post
		status      string
		featured    int
		createdAt   string
		updatedAt   string
		publishedAt *string
	)
	err := row.Scan(&post.ID, &post.Title, &post.Slug, &post.Summary, &post.ContentMD,
		&post.ContentHTML, &post.Cover, &post.Category, &status, &featured, &post.Views,
		&post.ReadingTime, &createdAt, &updatedAt, &publishedAt)
	if err != nil {
		return nil, err
	}
	if post.CreatedAt, err = parseTime(createdAt); err != nil {
		return nil, err
	}
	if post.UpdatedAt, err = parseTime(updatedAt); err != nil {
		return nil, err
	}
	if post.PublishedAt, err = parseNullTime(publishedAt); err != nil {
		return nil, err
	}
	post.Status = model.PostStatus(status)
	post.Featured = featured != 0
	post.Tags = []string{}
	return &post, nil
}

func scanPostSummary(row scanner) (*model.PostSummary, error) {
	var (
		post        model.PostSummary
		status      string
		featured    int
		updatedAt   string
		publishedAt *string
	)
	err := row.Scan(&post.ID, &post.Title, &post.Slug, &post.Summary, &post.Cover,
		&post.Category, &status, &featured, &post.Views, &post.ReadingTime, &updatedAt, &publishedAt)
	if err != nil {
		return nil, err
	}
	if post.UpdatedAt, err = parseTime(updatedAt); err != nil {
		return nil, err
	}
	if post.PublishedAt, err = parseNullTime(publishedAt); err != nil {
		return nil, err
	}
	post.Status = model.PostStatus(status)
	post.Featured = featured != 0
	post.Tags = []string{}
	return &post, nil
}

func (s *PostStore) attachTags(ctx context.Context, posts []*model.Post) error {
	if len(posts) == 0 {
		return nil
	}
	ids := make([]int64, len(posts))
	for i, post := range posts {
		ids[i] = post.ID
	}
	tagMap, err := s.tagsFor(ctx, ids)
	if err != nil {
		return err
	}
	for _, post := range posts {
		if tags := tagMap[post.ID]; tags != nil {
			post.Tags = tags
		}
	}
	return nil
}

func (s *PostStore) tagsFor(ctx context.Context, ids []int64) (map[int64][]string, error) {
	result := make(map[int64][]string, len(ids))
	if len(ids) == 0 {
		return result, nil
	}
	args := make([]any, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	query := `SELECT pt.post_id, t.name FROM post_tags pt
		JOIN tags t ON t.id = pt.tag_id
		WHERE pt.post_id IN (` + placeholders(len(ids)) + `)
		ORDER BY t.name COLLATE NOCASE`
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("查询文章标签: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var (
			postID int64
			name   string
		)
		if err := rows.Scan(&postID, &name); err != nil {
			return nil, fmt.Errorf("读取文章标签: %w", err)
		}
		result[postID] = append(result[postID], name)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历文章标签: %w", err)
	}
	return result, nil
}

func replaceTags(ctx context.Context, tx *sql.Tx, postID int64, tags []string) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM post_tags WHERE post_id = ?`, postID); err != nil {
		return fmt.Errorf("清理旧标签: %w", err)
	}
	if len(tags) == 0 {
		return nil
	}
	tagIDs := make([]int64, 0, len(tags))
	for _, name := range tags {
		id, err := ensureTag(ctx, tx, name)
		if err != nil {
			return err
		}
		tagIDs = append(tagIDs, id)
	}
	for _, tagID := range tagIDs {
		if _, err := tx.ExecContext(ctx,
			`INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)`, postID, tagID); err != nil {
			return fmt.Errorf("关联标签: %w", err)
		}
	}
	return nil
}

func ensureTag(ctx context.Context, tx *sql.Tx, name string) (int64, error) {
	var id int64
	err := tx.QueryRowContext(ctx, `SELECT id FROM tags WHERE name = ?`, name).Scan(&id)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, fmt.Errorf("查询标签: %w", err)
	}
	res, err := tx.ExecContext(ctx, `INSERT INTO tags (name) VALUES (?)`, name)
	if err != nil {
		return 0, fmt.Errorf("写入标签: %w", err)
	}
	id, err = res.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("读取标签 ID: %w", err)
	}
	return id, nil
}

func boolToInt(v bool) int {
	if v {
		return 1
	}
	return 0
}
