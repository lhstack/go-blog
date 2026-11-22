package httpapi

import (
	"io/fs"
	"net/http"
	"path"
	"strings"
	"time"

	"goblog/internal/webassets"
)

// indexHandler 在首次请求时读取 index.html 并缓存，减少重复读盘。
type indexHandler struct {
	fsys    fs.FS
	content []byte
	modTime time.Time
}

func newIndexHandler(fsys fs.FS) *indexHandler {
	if fsys == nil {
		return &indexHandler{}
	}
	handler := &indexHandler{fsys: fsys}
	if info, err := fs.Stat(fsys, "index.html"); err == nil {
		handler.modTime = info.ModTime()
	}
	return handler
}

// load 按需读取入口文件内容；读取失败时返回 nil，由调用方决定如何响应。
func (h *indexHandler) load() []byte {
	if h.content != nil || h.fsys == nil {
		return h.content
	}
	data, err := fs.ReadFile(h.fsys, "index.html")
	if err != nil {
		return nil
	}
	h.content = data
	return h.content
}

// serveSPA 提供前端单页应用：存在的静态文件直接返回，其它 GET 路径回退到 index.html，
// 让前端路由接管刷新与深链接。
func (s *Server) serveSPA(w http.ResponseWriter, r *http.Request) {
	clean := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
	if clean == "" || clean == "index.html" {
		s.writeIndex(w, r)
		return
	}
	if strings.HasPrefix(clean, "api/") || strings.HasPrefix(clean, "uploads/") {
		writeError(w, http.StatusNotFound, "接口不存在")
		return
	}
	if s.assetExists(clean) {
		s.assets.ServeHTTP(w, r)
		return
	}
	s.writeIndex(w, r)
}

// writeIndex 直接输出入口 HTML。这里不使用 http.FileServer，
// 因为它会把 /index.html 重定向到 /，从而造成 SPA 回退循环。
func (s *Server) writeIndex(w http.ResponseWriter, r *http.Request) {
	content := s.index.load()
	if content == nil {
		// 前端尚未构建时给出可操作的说明页，而不是一个空白 500。
		content = []byte(webassets.MissingPage)
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	// SPA 入口不可缓存，否则发版后客户端会继续加载旧的资源路径。
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)
	if r.Method == http.MethodHead {
		return
	}
	if _, err := w.Write(content); err != nil {
		return
	}
}

// assetExists 判断构建产物中是否存在该文件，用于区分静态资源与前端路由。
func (s *Server) assetExists(name string) bool {
	if s.assetFS == nil {
		return false
	}
	info, err := fs.Stat(s.assetFS, name)
	return err == nil && !info.IsDir()
}
