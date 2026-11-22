package store

import (
	"context"
	"database/sql"
	"fmt"

	"goblog/internal/model"
)

// CommentStore 负责评论读写。
type CommentStore struct {
	db *sql.DB
}

const commentColumns = `c.id, c.post_id, c.author, c.email, c.website, c.content, c.status, c.created_at`

// Create 写入一条评论，返回完整对象。
func (s *CommentStore) Create(ctx context.Context, comment *model.Comment) error {
	res, err := s.db.ExecContext(ctx, `
		INSERT INTO comments (post_id, author, email, website, content, status, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		comment.PostID, comment.Author, comment.Email, comment.Website, comment.Content,
		string(comment.Status), formatTime(comment.CreatedAt))
	if err != nil {
		return fmt.Errorf("写入评论: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return fmt.Errorf("读取评论 ID: %w", err)
	}
	comment.ID = id
	return nil
}

// ListApproved 返回某篇文章已通过的评论，按时间正序便于阅读对话。
func (s *CommentStore) ListApproved(ctx context.Context, postID int64) ([]model.Comment, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+commentColumns+` FROM comments c
		WHERE c.post_id = ? AND c.status = 'approved' ORDER BY c.created_at ASC, c.id ASC`, postID)
	if err != nil {
		return nil, fmt.Errorf("查询评论: %w", err)
	}
	defer rows.Close()
	return scanComments(rows)
}

// ListRecentApproved 返回全站最新已通过评论，用于首页侧栏。
func (s *CommentStore) ListRecentApproved(ctx context.Context, limit int) ([]model.Comment, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+commentColumns+`,
			p.title AS post_title, p.slug AS post_slug
		FROM comments c JOIN posts p ON p.id = c.post_id
		WHERE c.status = 'approved'
		ORDER BY c.created_at DESC, c.id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, fmt.Errorf("查询最新评论: %w", err)
	}
	defer rows.Close()

	comments := make([]model.Comment, 0, limit)
	for rows.Next() {
		comment, err := scanCommentWithPost(rows)
		if err != nil {
			return nil, err
		}
		comments = append(comments, *comment)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历最新评论: %w", err)
	}
	return comments, nil
}

// CommentFilter 描述评论列表查询条件。
type CommentFilter struct {
	Status   model.CommentStatus
	PostID   int64
	Page     int
	PageSize int
}

// List 供管理端分页查询任意状态的评论。
func (s *CommentStore) List(ctx context.Context, filter CommentFilter) (*model.PageResult[model.Comment], error) {
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.PageSize < 1 || filter.PageSize > 100 {
		filter.PageSize = 20
	}

	clauses := make([]string, 0, 2)
	args := make([]any, 0, 2)
	if filter.Status != "" {
		clauses = append(clauses, "c.status = ?")
		args = append(args, string(filter.Status))
	}
	if filter.PostID != 0 {
		clauses = append(clauses, "c.post_id = ?")
		args = append(args, filter.PostID)
	}
	where := ""
	if len(clauses) > 0 {
		where = " WHERE "
		for i, clause := range clauses {
			if i > 0 {
				where += " AND "
			}
			where += clause
		}
	}

	var total int
	if err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM comments c`+where, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("统计评论: %w", err)
	}

	query := `SELECT ` + commentColumns + `, p.title AS post_title, p.slug AS post_slug
		FROM comments c JOIN posts p ON p.id = c.post_id` + where + `
		ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`
	args = append(args, filter.PageSize, (filter.Page-1)*filter.PageSize)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("查询评论列表: %w", err)
	}
	defer rows.Close()

	comments := make([]model.Comment, 0, filter.PageSize)
	for rows.Next() {
		comment, err := scanCommentWithPost(rows)
		if err != nil {
			return nil, err
		}
		comments = append(comments, *comment)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历评论列表: %w", err)
	}

	return &model.PageResult[model.Comment]{
		Items:    comments,
		Total:    total,
		Page:     filter.Page,
		PageSize: filter.PageSize,
	}, nil
}

// UpdateStatus 修改评论审核状态。
func (s *CommentStore) UpdateStatus(ctx context.Context, id int64, status model.CommentStatus) error {
	res, err := s.db.ExecContext(ctx, `UPDATE comments SET status = ? WHERE id = ?`, string(status), id)
	if err != nil {
		return fmt.Errorf("更新评论状态: %w", err)
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("检查评论更新结果: %w", err)
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

// Delete 删除评论。
func (s *CommentStore) Delete(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM comments WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("删除评论: %w", err)
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("检查评论删除结果: %w", err)
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

// CountApproved 统计某篇文章已通过评论数量。
func (s *CommentStore) CountApproved(ctx context.Context, postID int64) (int, error) {
	var total int
	err := s.db.QueryRowContext(ctx,
		`SELECT count(*) FROM comments WHERE post_id = ? AND status = 'approved'`, postID).Scan(&total)
	if err != nil {
		return 0, fmt.Errorf("统计文章评论: %w", err)
	}
	return total, nil
}

func scanComments(rows *sql.Rows) ([]model.Comment, error) {
	comments := make([]model.Comment, 0, 8)
	for rows.Next() {
		var (
			comment   model.Comment
			status    string
			createdAt string
		)
		err := rows.Scan(&comment.ID, &comment.PostID, &comment.Author, &comment.Email,
			&comment.Website, &comment.Content, &status, &createdAt)
		if err != nil {
			return nil, fmt.Errorf("读取评论: %w", err)
		}
		comment.Status = model.CommentStatus(status)
		comment.CreatedAt, err = parseTime(createdAt)
		if err != nil {
			return nil, err
		}
		comments = append(comments, comment)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历评论: %w", err)
	}
	return comments, nil
}

func scanCommentWithPost(row scanner) (*model.Comment, error) {
	var (
		comment   model.Comment
		status    string
		createdAt string
	)
	err := row.Scan(&comment.ID, &comment.PostID, &comment.Author, &comment.Email,
		&comment.Website, &comment.Content, &status, &createdAt,
		&comment.PostTitle, &comment.PostSlug)
	if err != nil {
		return nil, fmt.Errorf("读取评论: %w", err)
	}
	comment.Status = model.CommentStatus(status)
	if comment.CreatedAt, err = parseTime(createdAt); err != nil {
		return nil, err
	}
	return &comment, nil
}
