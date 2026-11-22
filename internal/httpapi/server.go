package httpapi

import (
	"io/fs"
	"net/http"

	"goblog/internal/service"
)

// Dependencies 是 HTTP 层需要的全部服务与静态资源，由 main 注入。
type Dependencies struct {
	Auth     *service.AuthService
	Posts    *service.PostService
	Comments *service.CommentService
	Settings *service.SettingsService
	Media    *service.MediaService
	Assets   http.Handler
	AssetFS  fs.FS
	SiteURL  string
}

// Server 持有路由所需的依赖。
type Server struct {
	auth     *service.AuthService
	posts    *service.PostService
	comments *service.CommentService
	settings *service.SettingsService
	media    *service.MediaService
	assets   http.Handler
	assetFS  fs.FS
	index    *indexHandler
	siteURL  string
}

// New 构造 Server。
func New(deps Dependencies) *Server {
	return &Server{
		auth:     deps.Auth,
		posts:    deps.Posts,
		comments: deps.Comments,
		settings: deps.Settings,
		media:    deps.Media,
		assets:   deps.Assets,
		assetFS:  deps.AssetFS,
		index:    newIndexHandler(deps.AssetFS),
		siteURL:  deps.SiteURL,
	}
}

// Handler 返回带中间件的完整路由。
func (s *Server) Handler(corsOrigin, uploadDir string) http.Handler {
	mux := http.NewServeMux()
	s.registerPublic(mux)
	s.registerAuth(mux)
	s.registerAdmin(mux)
	s.registerAssets(mux, uploadDir)

	var handler http.Handler = mux
	handler = withSecurityHeaders(handler)
	handler = withCORS(corsOrigin, handler)
	handler = withRecovery(handler)
	handler = withLogging(handler)
	return handler
}

func (s *Server) registerPublic(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/health", s.handleHealth)
	mux.HandleFunc("GET /api/site", s.handleSite)
	mux.HandleFunc("GET /api/posts", s.handlePublicPosts)
	mux.HandleFunc("GET /api/posts/{slug}", s.handlePublicPost)
	mux.HandleFunc("GET /api/posts/{slug}/comments", s.handlePublicComments)
	mux.HandleFunc("POST /api/posts/{slug}/comments", s.handleCreateComment)
	mux.HandleFunc("GET /api/tags", s.handleTags)
	mux.HandleFunc("GET /api/categories", s.handleCategories)
	mux.HandleFunc("GET /api/archive", s.handleArchive)
	mux.HandleFunc("GET /api/comments/recent", s.handleRecentComments)
	mux.HandleFunc("GET /rss.xml", s.handleRSS)
	mux.HandleFunc("GET /sitemap.xml", s.handleSitemap)
}

func (s *Server) registerAuth(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	mux.HandleFunc("GET /api/auth/me", s.withAuth(s.handleMe))
	mux.HandleFunc("POST /api/auth/password", s.withAuth(s.handleChangePassword))
}

func (s *Server) registerAdmin(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/admin/stats", s.withAuth(s.handleStats))
	mux.HandleFunc("GET /api/admin/posts", s.withAuth(s.handleAdminPosts))
	mux.HandleFunc("POST /api/admin/posts", s.withAuth(s.handleCreatePost))
	mux.HandleFunc("GET /api/admin/posts/{id}", s.withAuth(s.handleAdminPost))
	mux.HandleFunc("PUT /api/admin/posts/{id}", s.withAuth(s.handleUpdatePost))
	mux.HandleFunc("DELETE /api/admin/posts/{id}", s.withAuth(s.handleDeletePost))
	mux.HandleFunc("GET /api/admin/comments", s.withAuth(s.handleAdminComments))
	mux.HandleFunc("PATCH /api/admin/comments/{id}", s.withAuth(s.handleModerateComment))
	mux.HandleFunc("DELETE /api/admin/comments/{id}", s.withAuth(s.handleDeleteComment))
	mux.HandleFunc("GET /api/admin/settings", s.withAuth(s.handleGetSettings))
	mux.HandleFunc("PUT /api/admin/settings", s.withAuth(s.handleSaveSettings))
	mux.HandleFunc("POST /api/admin/uploads", s.withAuth(s.handleUpload))
}

func (s *Server) registerAssets(mux *http.ServeMux, uploadDir string) {
	files := http.FileServer(http.Dir(uploadDir))
	mux.Handle("GET /uploads/", cacheControl("public, max-age=604800", http.StripPrefix("/uploads/", files)))
	mux.HandleFunc("GET /", s.serveSPA)
	mux.HandleFunc("/", s.handleFallback)
}

// cacheControl 为静态资源追加缓存头。
func cacheControl(value string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", value)
		next.ServeHTTP(w, r)
	})
}
