package store

import (
	"context"
	"database/sql"
	"fmt"

	"goblog/internal/model"
)

// TagStore 负责标签与分类的聚合查询。
type TagStore struct {
	db *sql.DB
}

// List 返回全部标签及其已发布文章数量，无文章的标签不展示。
func (s *TagStore) List(ctx context.Context) ([]model.Tag, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT t.name, count(*) AS total
		FROM tags t
		JOIN post_tags pt ON pt.tag_id = t.id
		JOIN posts p ON p.id = pt.post_id AND p.status = 'published'
		GROUP BY t.id
		ORDER BY total DESC, t.name COLLATE NOCASE`)
	if err != nil {
		return nil, fmt.Errorf("查询标签: %w", err)
	}
	defer rows.Close()

	tags := make([]model.Tag, 0, 16)
	for rows.Next() {
		var tag model.Tag
		if err := rows.Scan(&tag.Name, &tag.Count); err != nil {
			return nil, fmt.Errorf("读取标签: %w", err)
		}
		tags = append(tags, tag)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历标签: %w", err)
	}
	return tags, nil
}

// Categories 返回分类及其已发布文章数量。
func (s *TagStore) Categories(ctx context.Context) ([]model.Category, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT category, count(*) AS total
		FROM posts
		WHERE status = 'published' AND category <> ''
		GROUP BY category
		ORDER BY total DESC, category COLLATE NOCASE`)
	if err != nil {
		return nil, fmt.Errorf("查询分类: %w", err)
	}
	defer rows.Close()

	categories := make([]model.Category, 0, 8)
	for rows.Next() {
		var category model.Category
		if err := rows.Scan(&category.Name, &category.Count); err != nil {
			return nil, fmt.Errorf("读取分类: %w", err)
		}
		categories = append(categories, category)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历分类: %w", err)
	}
	return categories, nil
}

// DeleteUnused 清理没有任何文章引用的标签。
func (s *TagStore) DeleteUnused(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM post_tags)`)
	if err != nil {
		return fmt.Errorf("清理空闲标签: %w", err)
	}
	return nil
}
