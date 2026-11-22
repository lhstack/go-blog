package service

import (
	"context"
	"errors"
	"net/mail"
	"net/url"
	"strings"
	"time"

	"goblog/internal/model"
	"goblog/internal/store"
)

// CommentService 负责评论提交与审核。
type CommentService struct {
	comments *store.CommentStore
	posts    *store.PostStore
	settings *SettingsService
	now      func() time.Time
}

// NewCommentService 构造评论服务。
func NewCommentService(comments *store.CommentStore, posts *store.PostStore, settings *SettingsService) *CommentService {
	return &CommentService{
		comments: comments,
		posts:    posts,
		settings: settings,
		now:      func() time.Time { return time.Now().UTC() },
	}
}

// Submit 为指定文章创建评论。审核开关决定初始状态，返回是否已直接展示。
func (s *CommentService) Submit(ctx context.Context, slug string, input model.CommentInput) (*model.Comment, bool, error) {
	post, err := s.posts.GetPublishedBySlug(ctx, slug)
	if errors.Is(err, store.ErrNotFound) {
		return nil, false, ErrNotFound
	}
	if err != nil {
		return nil, false, err
	}

	collector := &fieldCollector{}
	author := required(collector, "author", input.Author, "请填写昵称", 40)
	email := optional(collector, "email", input.Email, 120)
	if email != "" {
		if _, err := mail.ParseAddress(email); err != nil {
			collector.add("email", "邮箱格式不正确")
		}
	}
	website := optional(collector, "website", input.Website, 200)
	if website != "" && !validWebsite(website) {
		collector.add("website", "网址需以 http:// 或 https:// 开头")
	}
	content := required(collector, "content", input.Content, "请填写评论内容", 1000)
	if err := collector.err(); err != nil {
		return nil, false, err
	}

	settings, err := s.settings.Get(ctx)
	if err != nil {
		return nil, false, err
	}
	status := model.CommentApproved
	if settings.CommentNeed {
		status = model.CommentPending
	}

	comment := &model.Comment{
		PostID:    post.ID,
		PostTitle: post.Title,
		PostSlug:  post.Slug,
		Author:    author,
		Email:     email,
		Website:   website,
		Content:   content,
		Status:    status,
		CreatedAt: s.now(),
	}
	if err := s.comments.Create(ctx, comment); err != nil {
		return nil, false, err
	}
	return comment, status == model.CommentApproved, nil
}

// ListApproved 返回文章下已通过的评论。
func (s *CommentService) ListApproved(ctx context.Context, slug string) ([]model.Comment, error) {
	post, err := s.posts.GetPublishedBySlug(ctx, slug)
	if errors.Is(err, store.ErrNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return s.comments.ListApproved(ctx, post.ID)
}

// Recent 返回全站最新已通过评论。
func (s *CommentService) Recent(ctx context.Context, limit int) ([]model.Comment, error) {
	if limit <= 0 || limit > 50 {
		limit = 5
	}
	return s.comments.ListRecentApproved(ctx, limit)
}

// AdminList 返回后台评论列表。
func (s *CommentService) AdminList(ctx context.Context, filter store.CommentFilter) (*model.PageResult[model.Comment], error) {
	if filter.Status != "" && !filter.Status.Valid() {
		return nil, NewValidationError("status", "状态只能是 pending、approved 或 spam")
	}
	return s.comments.List(ctx, filter)
}

// Moderate 更新评论状态。
func (s *CommentService) Moderate(ctx context.Context, id int64, status model.CommentStatus) error {
	if !status.Valid() {
		return NewValidationError("status", "状态只能是 pending、approved 或 spam")
	}
	if err := s.comments.UpdateStatus(ctx, id, status); errors.Is(err, store.ErrNotFound) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	return nil
}

// Delete 删除评论。
func (s *CommentService) Delete(ctx context.Context, id int64) error {
	if err := s.comments.Delete(ctx, id); errors.Is(err, store.ErrNotFound) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	return nil
}

// CountApproved 统计文章已通过评论数。
func (s *CommentService) CountApproved(ctx context.Context, postID int64) (int, error) {
	return s.comments.CountApproved(ctx, postID)
}

func validWebsite(raw string) bool {
	parsed, err := url.Parse(raw)
	if err != nil {
		return false
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return false
	}
	return strings.Contains(parsed.Host, ".")
}
