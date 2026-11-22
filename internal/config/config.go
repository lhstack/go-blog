package config

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"time"
)

// DefaultAdminPassword 是未配置初始管理员密码时使用的内置默认值。
const DefaultAdminPassword = "admin123"

// Config 汇总进程启动所需的全部配置，全部来自环境变量并带可用默认值。
type Config struct {
	Addr                string
	DataDir             string
	DatabaseDSN         string
	UploadDir           string
	JWTSecret           []byte
	TokenTTL            time.Duration
	AdminUser           string
	AdminPass           string
	AdminPassConfigured bool
	SiteURL             string
	CORSOrigin          string
	Debug               bool
}

// Load 读取环境变量并准备数据目录。JWT 密钥在首次启动时生成并落盘，
// 以便重启后已签发的令牌仍然有效。
func Load() (*Config, error) {
	dataDir, err := resolveDataDir(env("GOBLOG_DATA_DIR", "./data"))
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, fmt.Errorf("创建数据目录: %w", err)
	}

	uploadDir := env("GOBLOG_UPLOAD_DIR", filepath.Join(dataDir, "uploads"))
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		return nil, fmt.Errorf("创建上传目录: %w", err)
	}

	secret, err := loadJWTSecret(filepath.Join(dataDir, "jwt.secret"))
	if err != nil {
		return nil, err
	}

	ttlHours, err := strconv.Atoi(env("GOBLOG_TOKEN_TTL_HOURS", "168"))
	if err != nil || ttlHours <= 0 {
		return nil, fmt.Errorf("GOBLOG_TOKEN_TTL_HOURS 必须是正整数")
	}

	adminPass := os.Getenv("GOBLOG_ADMIN_PASSWORD")
	adminPassConfigured := adminPass != ""
	if !adminPassConfigured {
		adminPass = DefaultAdminPassword
	}

	return &Config{
		Addr:                env("GOBLOG_ADDR", ":8080"),
		DataDir:             dataDir,
		DatabaseDSN:         filepath.Join(dataDir, "goblog.db"),
		UploadDir:           uploadDir,
		JWTSecret:           secret,
		TokenTTL:            time.Duration(ttlHours) * time.Hour,
		AdminUser:           env("GOBLOG_ADMIN_USER", "admin"),
		AdminPass:           adminPass,
		AdminPassConfigured: adminPassConfigured,
		SiteURL:             env("GOBLOG_SITE_URL", ""),
		CORSOrigin:          env("GOBLOG_CORS_ORIGIN", ""),
		Debug:               env("GOBLOG_DEBUG", "false") == "true",
	}, nil
}

// resolveDataDir 将相对路径定位到实际可执行文件所在目录，而不是启动目录。
func resolveDataDir(path string) (string, error) {
	if filepath.IsAbs(path) {
		return filepath.Clean(path), nil
	}

	executable, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("获取可执行文件路径: %w", err)
	}
	executable, err = filepath.EvalSymlinks(executable)
	if err != nil {
		return "", fmt.Errorf("解析可执行文件路径: %w", err)
	}
	return filepath.Join(filepath.Dir(executable), path), nil
}

func loadJWTSecret(path string) ([]byte, error) {
	if raw := os.Getenv("GOBLOG_JWT_SECRET"); raw != "" {
		return []byte(raw), nil
	}
	existing, err := os.ReadFile(path)
	if err == nil && len(existing) >= 32 {
		return existing, nil
	}
	if err != nil && !os.IsNotExist(err) {
		return nil, fmt.Errorf("读取 JWT 密钥: %w", err)
	}

	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return nil, fmt.Errorf("生成 JWT 密钥: %w", err)
	}
	secret := []byte(hex.EncodeToString(buf))
	if err := os.WriteFile(path, secret, 0o600); err != nil {
		return nil, fmt.Errorf("写入 JWT 密钥: %w", err)
	}
	slog.Info("已生成新的 JWT 密钥", "path", path)
	return secret, nil
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
