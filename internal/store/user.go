package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// UserStore 负责管理员账号读写。
type UserStore struct {
	db *sql.DB
}

// User 是登录所需的账号记录。
type User struct {
	ID           int64
	Username     string
	PasswordHash string
	DisplayName  string
	CreatedAt    time.Time
}

// GetByUsername 按用户名查询账号。
func (s *UserStore) GetByUsername(ctx context.Context, username string) (*User, error) {
	var (
		user      User
		createdAt string
	)
	err := s.db.QueryRowContext(ctx,
		`SELECT id, username, password_hash, display_name, created_at FROM users WHERE username = ?`,
		username).Scan(&user.ID, &user.Username, &user.PasswordHash, &user.DisplayName, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("查询账号: %w", err)
	}
	if user.CreatedAt, err = parseTime(createdAt); err != nil {
		return nil, err
	}
	return &user, nil
}

// GetByID 按主键查询账号。
func (s *UserStore) GetByID(ctx context.Context, id int64) (*User, error) {
	var (
		user      User
		createdAt string
	)
	err := s.db.QueryRowContext(ctx,
		`SELECT id, username, password_hash, display_name, created_at FROM users WHERE id = ?`,
		id).Scan(&user.ID, &user.Username, &user.PasswordHash, &user.DisplayName, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("查询账号: %w", err)
	}
	if user.CreatedAt, err = parseTime(createdAt); err != nil {
		return nil, err
	}
	return &user, nil
}

// Count 返回账号总数，用于判断是否需要初始化管理员。
func (s *UserStore) Count(ctx context.Context) (int, error) {
	var total int
	if err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM users`).Scan(&total); err != nil {
		return 0, fmt.Errorf("统计账号: %w", err)
	}
	return total, nil
}

// Create 创建账号。
func (s *UserStore) Create(ctx context.Context, username, passwordHash, displayName string, createdAt time.Time) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO users (username, password_hash, display_name, created_at) VALUES (?, ?, ?, ?)`,
		username, passwordHash, displayName, formatTime(createdAt))
	if err != nil {
		return fmt.Errorf("创建账号: %w", err)
	}
	return nil
}

// UpdatePassword 修改密码哈希。
func (s *UserStore) UpdatePassword(ctx context.Context, id int64, passwordHash string) error {
	res, err := s.db.ExecContext(ctx, `UPDATE users SET password_hash = ? WHERE id = ?`, passwordHash, id)
	if err != nil {
		return fmt.Errorf("更新密码: %w", err)
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("检查密码更新结果: %w", err)
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

// SettingsStore 以键值对形式保存站点配置。
type SettingsStore struct {
	db *sql.DB
}

// Load 读取全部配置项，返回 key → value。
func (s *SettingsStore) Load(ctx context.Context) (map[string]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT key, value FROM settings`)
	if err != nil {
		return nil, fmt.Errorf("读取站点配置: %w", err)
	}
	defer rows.Close()

	values := make(map[string]string, 12)
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return nil, fmt.Errorf("读取站点配置项: %w", err)
		}
		values[key] = value
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历站点配置: %w", err)
	}
	return values, nil
}

// Save 在一个事务内覆盖写入配置项。
func (s *SettingsStore) Save(ctx context.Context, values map[string]string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("开始事务: %w", err)
	}
	defer tx.Rollback()

	for key, value := range values {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO settings (key, value) VALUES (?, ?)
			 ON CONFLICT (key) DO UPDATE SET value = excluded.value`, key, value); err != nil {
			return fmt.Errorf("写入配置 %s: %w", key, err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("提交事务: %w", err)
	}
	return nil
}
