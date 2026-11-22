package service

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// MaxUploadBytes 是单张图片允许的最大体积（8MB）。
const MaxUploadBytes = 8 << 20

// imageExtensions 是允许上传的图片类型与扩展名映射。
var imageExtensions = map[string]string{
	"image/jpeg":    ".jpg",
	"image/png":     ".png",
	"image/gif":     ".gif",
	"image/webp":    ".webp",
	"image/svg+xml": ".svg",
}

// MediaService 负责接收上传图片并按日期落盘。
type MediaService struct {
	dir string
	now func() time.Time
}

// NewMediaService 构造上传服务。dir 必须是已存在的目录。
func NewMediaService(dir string) *MediaService {
	return &MediaService{dir: dir, now: func() time.Time { return time.Now().UTC() }}
}

// UploadResult 是上传成功后的访问信息。
type UploadResult struct {
	URL  string `json:"url"`
	Name string `json:"name"`
	Size int64  `json:"size"`
}

// Save 校验图片类型与大小后写入 uploads/YYYY/MM/ 目录。
// 只信任文件头嗅探出的类型，不信任客户端声明的文件名与 Content-Type。
func (s *MediaService) Save(src io.Reader, filename string) (*UploadResult, error) {
	buf := make([]byte, 512)
	read, err := io.ReadFull(src, buf)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) && !errors.Is(err, io.EOF) {
		return nil, fmt.Errorf("读取上传内容: %w", err)
	}
	if read == 0 {
		return nil, NewValidationError("file", "文件内容为空")
	}

	contentType := http.DetectContentType(buf[:read])
	ext, ok := imageExtensions[contentType]
	if !ok {
		return nil, ErrUnsupportedFormat
	}

	now := s.now()
	relativeDir := filepath.Join(now.Format("2006"), now.Format("01"))
	targetDir := filepath.Join(s.dir, relativeDir)
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		return nil, fmt.Errorf("创建上传目录: %w", err)
	}

	name, err := randomName(ext)
	if err != nil {
		return nil, err
	}
	targetPath := filepath.Join(targetDir, name)

	file, err := os.OpenFile(targetPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return nil, fmt.Errorf("创建上传文件: %w", err)
	}
	defer file.Close()

	// 已嗅探的头部需一并写入，再继续拷贝剩余内容。
	written, err := file.Write(buf[:read])
	if err != nil {
		os.Remove(targetPath)
		return nil, fmt.Errorf("写入上传文件: %w", err)
	}
	copied, err := io.Copy(file, io.LimitReader(src, MaxUploadBytes-int64(written)+1))
	if err != nil {
		os.Remove(targetPath)
		return nil, fmt.Errorf("写入上传文件: %w", err)
	}
	total := int64(written) + copied
	if total > MaxUploadBytes {
		os.Remove(targetPath)
		return nil, ErrFileTooLarge
	}

	slog.Info("已保存上传图片", "file", targetPath, "size", total, "original", sanitizeName(filename))
	url := "/uploads/" + filepath.ToSlash(filepath.Join(relativeDir, name))
	return &UploadResult{URL: url, Name: name, Size: total}, nil
}

func randomName(ext string) (string, error) {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("生成文件名: %w", err)
	}
	return hex.EncodeToString(buf) + ext, nil
}

// sanitizeName 仅用于日志展示，去除路径分隔符避免日志注入。
func sanitizeName(name string) string {
	name = filepath.Base(strings.TrimSpace(name))
	if len(name) > 80 {
		return name[:80]
	}
	return name
}
