package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"goblog/internal/store"
)

// AuthService 负责管理员登录、令牌签发与账号初始化。
type AuthService struct {
	users     *store.UserStore
	secret    []byte
	ttl       time.Duration
	adminUser string
	adminPass string

	mu         sync.Mutex
	ensureOnce bool
}

// NewAuthService 构造鉴权服务。
func NewAuthService(users *store.UserStore, secret []byte, ttl time.Duration, adminUser, adminPass string) *AuthService {
	return &AuthService{
		users:     users,
		secret:    secret,
		ttl:       ttl,
		adminUser: adminUser,
		adminPass: adminPass,
	}
}

// Session 是登录成功后返回给前端的信息。
type Session struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expiresAt"`
	Username  string    `json:"username"`
	Display   string    `json:"displayName"`
}

// Claims 是 JWT 载荷。
type Claims struct {
	UserID   int64  `json:"uid"`
	Username string `json:"usr"`
	jwt.RegisteredClaims
}

// EnsureAdmin 在首次启动且无账号时创建初始管理员。
// 该操作幂等：已有账号时直接返回。
func (s *AuthService) EnsureAdmin(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.ensureOnce {
		return nil
	}

	total, err := s.users.Count(ctx)
	if err != nil {
		return err
	}
	if total > 0 {
		s.ensureOnce = true
		return nil
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(s.adminPass), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("生成密码哈希: %w", err)
	}
	if err := s.users.Create(ctx, s.adminUser, string(hash), s.adminUser, time.Now().UTC()); err != nil {
		return err
	}
	s.ensureOnce = true
	slog.Warn("已创建初始管理员账号，请尽快修改密码",
		"username", s.adminUser)
	return nil
}

// Login 校验凭据并签发令牌。
func (s *AuthService) Login(ctx context.Context, username, password string) (*Session, error) {
	collector := &fieldCollector{}
	username = required(collector, "username", username, "请输入用户名", 64)
	password = required(collector, "password", password, "请输入密码", 128)
	if err := collector.err(); err != nil {
		return nil, err
	}

	user, err := s.users.GetByUsername(ctx, username)
	if errors.Is(err, store.ErrNotFound) {
		// 账不存在时也执行一次哈希比较，避免通过响应时间枚举用户名。
		bcrypt.CompareHashAndPassword([]byte("$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin"), []byte(password))
		return nil, ErrInvalidCredentials
	}
	if err != nil {
		return nil, err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	expiresAt := time.Now().UTC().Add(s.ttl)
	claims := Claims{
		UserID:   user.ID,
		Username: user.Username,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.Username,
			IssuedAt:  jwt.NewNumericDate(time.Now().UTC()),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			Issuer:    "goblog",
		},
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.secret)
	if err != nil {
		return nil, fmt.Errorf("签发令牌: %w", err)
	}

	display := user.DisplayName
	if display == "" {
		display = user.Username
	}
	return &Session{
		Token:     token,
		ExpiresAt: expiresAt,
		Username:  user.Username,
		Display:   display,
	}, nil
}

// ParseToken 校验令牌并返回载荷。
func (s *AuthService) ParseToken(raw string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(raw, claims, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("非预期签名算法: %v", token.Header["alg"])
		}
		return s.secret, nil
	}, jwt.WithIssuer("goblog"))
	if err != nil {
		return nil, fmt.Errorf("校验令牌: %w", err)
	}
	if !token.Valid {
		return nil, errors.New("令牌无效")
	}
	return claims, nil
}

// CurrentUser 按令牌载荷读取账号信息。
func (s *AuthService) CurrentUser(ctx context.Context, userID int64) (*store.User, error) {
	user, err := s.users.GetByID(ctx, userID)
	if errors.Is(err, store.ErrNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return user, nil
}

// ChangePassword 校验旧密码后更新为新密码。
func (s *AuthService) ChangePassword(ctx context.Context, userID int64, oldPassword, newPassword string) error {
	collector := &fieldCollector{}
	oldPassword = required(collector, "oldPassword", oldPassword, "请输入当前密码", 128)
	newPassword = required(collector, "newPassword", newPassword, "请输入新密码", 128)
	if len(newPassword) > 0 && len(newPassword) < 8 {
		collector.add("newPassword", "新密码至少 8 个字符")
	}
	if err := collector.err(); err != nil {
		return err
	}

	user, err := s.users.GetByID(ctx, userID)
	if errors.Is(err, store.ErrNotFound) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(oldPassword)); err != nil {
		return NewValidationError("oldPassword", "当前密码不正确")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("生成密码哈希: %w", err)
	}
	return s.users.UpdatePassword(ctx, userID, string(hash))
}

// Profile 是当前登录用户的展示信息。
type Profile struct {
	ID        int64  `json:"id"`
	Username  string `json:"username"`
	Display   string `json:"displayName"`
	CreatedAt string `json:"createdAt"`
}

// Profile 读取账号资料。
func (s *AuthService) Profile(ctx context.Context, userID int64) (*Profile, error) {
	user, err := s.CurrentUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	display := user.DisplayName
	if display == "" {
		display = user.Username
	}
	return &Profile{
		ID:        user.ID,
		Username:  strings.TrimSpace(user.Username),
		Display:   display,
		CreatedAt: user.CreatedAt.Format(time.RFC3339),
	}, nil
}
