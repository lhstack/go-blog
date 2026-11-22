package httpapi_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"goblog/internal/database"
	"goblog/internal/httpapi"
	"goblog/internal/markdown"
	"goblog/internal/model"
	"goblog/internal/service"
	"goblog/internal/store"
	"goblog/internal/webassets"
)

// testApp 是测试用的完整服务实例，包含真实 SQLite 文件与 HTTP 处理器。
type testApp struct {
	server *httptest.Server
	token  string
}

func newTestApp(t *testing.T) *testApp {
	t.Helper()

	dir := t.TempDir()
	db, err := database.Open(t.Context(), filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("打开数据库: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	repo := store.New(db)
	auth := service.NewAuthService(repo.User, []byte("test-secret-key-for-integration"), time.Hour, "admin", "admin123")
	if err := auth.EnsureAdmin(t.Context()); err != nil {
		t.Fatalf("初始化管理员: %v", err)
	}
	settings := service.NewSettingsService(repo.Conf)
	posts := service.NewPostService(repo.Post, repo.Tag, markdown.New())
	comments := service.NewCommentService(repo.Cmt, repo.Post, settings)
	media := service.NewMediaService(t.TempDir())

	handler := httpapi.New(httpapi.Dependencies{
		Auth:     auth,
		Posts:    posts,
		Comments: comments,
		Settings: settings,
		Media:    media,
		Assets:   webassets.Handler(),
		AssetFS:  webassets.FS(),
	}).Handler("", dir)

	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)

	app := &testApp{server: server}
	app.token = app.login(t, "admin", "admin123")
	return app
}

func (a *testApp) request(t *testing.T, method, path string, body any) *http.Response {
	t.Helper()

	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("序列化请求体: %v", err)
		}
		reader = bytes.NewReader(payload)
	}

	req, err := http.NewRequestWithContext(t.Context(), method, a.server.URL+path, reader)
	if err != nil {
		t.Fatalf("构造请求: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if a.token != "" && path != "/api/auth/login" {
		req.Header.Set("Authorization", "Bearer "+a.token)
	}

	resp, err := a.server.Client().Do(req)
	if err != nil {
		t.Fatalf("发送请求: %v", err)
	}
	return resp
}

func (a *testApp) login(t *testing.T, username, password string) string {
	t.Helper()

	resp := a.request(t, http.MethodPost, "/api/auth/login", map[string]string{
		"username": username,
		"password": password,
	})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("登录失败，状态码 %d", resp.StatusCode)
	}

	var session struct {
		Token string `json:"token"`
	}
	decode(t, resp, &session)
	return session.Token
}

func decode(t *testing.T, resp *http.Response, target any) {
	t.Helper()
	if err := json.NewDecoder(resp.Body).Decode(target); err != nil {
		t.Fatalf("解析响应: %v", err)
	}
}

func expectStatus(t *testing.T, resp *http.Response, want int) {
	t.Helper()
	if resp.StatusCode != want {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("状态码期望 %d，实际 %d，响应 %s", want, resp.StatusCode, string(body))
	}
}

func createPost(t *testing.T, app *testApp, input model.PostInput) model.Post {
	t.Helper()

	resp := app.request(t, http.MethodPost, "/api/admin/posts", input)
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusCreated)

	var post model.Post
	decode(t, resp, &post)
	return post
}

func TestHealthAndSiteInfo(t *testing.T) {
	app := newTestApp(t)

	resp := app.request(t, http.MethodGet, "/api/health", nil)
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusOK)

	resp = app.request(t, http.MethodGet, "/api/site", nil)
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusOK)

	var site struct {
		Settings model.Settings `json:"settings"`
		Tags     []model.Tag    `json:"tags"`
	}
	decode(t, resp, &site)
	if site.Settings.Title == "" {
		t.Error("站点标题不应为空")
	}
	if !site.Settings.CommentNeed {
		t.Error("默认应开启评论审核")
	}
}

func TestLoginRejectsWrongPassword(t *testing.T) {
	app := newTestApp(t)

	resp := app.request(t, http.MethodPost, "/api/auth/login", map[string]string{
		"username": "admin",
		"password": "wrong-password",
	})
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusUnauthorized)
}

func TestAdminRequiresToken(t *testing.T) {
	app := newTestApp(t)
	app.token = ""

	resp := app.request(t, http.MethodGet, "/api/admin/posts", nil)
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusUnauthorized)
}

func TestCreatePostPublishesAndAppearsPublicly(t *testing.T) {
	app := newTestApp(t)

	post := createPost(t, app, model.PostInput{
		Title:    "第一篇：Go 与 SQLite",
		Content:  "# 你好\n\n正文内容。\n\n```go\nfmt.Println(\"hi\")\n```",
		Status:   model.PostPublished,
		Tags:     []string{"Go", "SQLite", "go"},
		Category: "技术",
	})

	if post.Slug != "go-sqlite" && !strings.HasPrefix(post.Slug, "post-") {
		t.Errorf("期望由标题生成别名，实际 %q", post.Slug)
	}
	if len(post.Tags) != 2 {
		t.Errorf("重复标签应去重，实际 %v", post.Tags)
	}
	if post.PublishedAt == nil {
		t.Fatal("发布文章应设置发布时间")
	}
	if !strings.Contains(post.ContentHTML, "<h1") {
		t.Errorf("正文应已渲染为 HTML，实际 %q", post.ContentHTML)
	}

	resp := app.request(t, http.MethodGet, "/api/posts", nil)
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusOK)

	var list model.PageResult[model.PostSummary]
	decode(t, resp, &list)
	if list.Total != 1 || len(list.Items) != 1 {
		t.Fatalf("公开列表应包含 1 篇，实际 %d", list.Total)
	}

	resp = app.request(t, http.MethodGet, "/api/posts/"+post.Slug, nil)
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusOK)

	var detail model.PostDetail
	decode(t, resp, &detail)
	if detail.Post.Views != 1 {
		t.Errorf("首次访问后阅读量应为 1，实际 %d", detail.Post.Views)
	}
}

func TestDraftIsInvisibleToPublic(t *testing.T) {
	app := newTestApp(t)

	post := createPost(t, app, model.PostInput{
		Title:   "草稿文章",
		Content: "尚未完成的正文",
		Status:  model.PostDraft,
	})
	if post.PublishedAt != nil {
		t.Error("草稿不应有发布时间")
	}

	resp := app.request(t, http.MethodGet, "/api/posts/"+post.Slug, nil)
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusNotFound)

	resp = app.request(t, http.MethodGet, "/api/posts", nil)
	defer resp.Body.Close()

	var list model.PageResult[model.PostSummary]
	decode(t, resp, &list)
	if list.Total != 0 {
		t.Errorf("公开列表不应包含草稿，实际 %d 篇", list.Total)
	}

	// 管理端仍应可见，便于继续编辑。
	resp = app.request(t, http.MethodGet, "/api/admin/posts", nil)
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusOK)

	var adminList model.PageResult[model.PostSummary]
	decode(t, resp, &adminList)
	if adminList.Total != 1 {
		t.Errorf("管理列表应包含草稿，实际 %d 篇", adminList.Total)
	}
}

func TestPostValidationErrors(t *testing.T) {
	app := newTestApp(t)

	resp := app.request(t, http.MethodPost, "/api/admin/posts", model.PostInput{
		Title:   "",
		Content: "",
		Status:  "unknown",
	})
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusBadRequest)

	var body struct {
		Message string            `json:"message"`
		Fields  map[string]string `json:"fields"`
	}
	decode(t, resp, &body)
	for _, field := range []string{"title", "contentMd", "status"} {
		if body.Fields[field] == "" {
			t.Errorf("缺少字段 %q 的错误提示，实际 %v", field, body.Fields)
		}
	}
}

func TestSlugConflictIsRejected(t *testing.T) {
	app := newTestApp(t)

	createPost(t, app, model.PostInput{
		Title:   "第一篇文章",
		Slug:    "fixed-slug",
		Content: "正文",
		Status:  model.PostPublished,
	})

	resp := app.request(t, http.MethodPost, "/api/admin/posts", model.PostInput{
		Title:   "第二篇文章",
		Slug:    "fixed-slug",
		Content: "正文",
		Status:  model.PostPublished,
	})
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusBadRequest)

	var body struct {
		Fields map[string]string `json:"fields"`
	}
	decode(t, resp, &body)
	if body.Fields["slug"] == "" {
		t.Errorf("应返回别名冲突提示，实际 %v", body.Fields)
	}
}

func TestReservedSlugIsRejected(t *testing.T) {
	app := newTestApp(t)

	resp := app.request(t, http.MethodPost, "/api/admin/posts", model.PostInput{
		Title:   "冲突页面",
		Slug:    "admin",
		Content: "正文",
		Status:  model.PostDraft,
	})
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusBadRequest)
}

func TestUpdateKeepsPublishTimeAndAllowsSlugChange(t *testing.T) {
	app := newTestApp(t)

	created := createPost(t, app, model.PostInput{
		Title:   "初始标题",
		Content: "初始正文",
		Status:  model.PostPublished,
	})

	resp := app.request(t, http.MethodPut, "/api/admin/posts/"+strconv.FormatInt(created.ID, 10), model.PostInput{
		Title:   "更新后的标题",
		Slug:    "renamed-post",
		Content: "更新后的正文",
		Status:  model.PostPublished,
	})
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusOK)

	var updated model.Post
	decode(t, resp, &updated)
	if updated.Title != "更新后的标题" || updated.Slug != "renamed-post" {
		t.Errorf("更新未生效: %+v", updated)
	}
	if updated.PublishedAt == nil || !updated.PublishedAt.Equal(*created.PublishedAt) {
		t.Errorf("发布时间应保持不变: %v -> %v", created.PublishedAt, updated.PublishedAt)
	}
	if updated.Views != created.Views {
		t.Errorf("更新不应重置阅读量: %d -> %d", created.Views, updated.Views)
	}
}

func TestCommentLifecycleWithReview(t *testing.T) {
	app := newTestApp(t)

	post := createPost(t, app, model.PostInput{
		Title:   "评论测试",
		Content: "正文",
		Status:  model.PostPublished,
	})

	resp := app.request(t, http.MethodPost, "/api/posts/"+post.Slug+"/comments", model.CommentInput{
		Author:  "访客",
		Email:   "visitor@example.com",
		Website: "https://example.com",
		Content: "写得不错",
	})
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusCreated)

	var submitted struct {
		Visible bool `json:"visible"`
	}
	decode(t, resp, &submitted)
	if submitted.Visible {
		t.Error("开启审核时新评论不应立即可见")
	}

	resp = app.request(t, http.MethodGet, "/api/posts/"+post.Slug+"/comments", nil)
	defer resp.Body.Close()

	var listed struct {
		Items []model.Comment `json:"items"`
	}
	decode(t, resp, &listed)
	if len(listed.Items) != 0 {
		t.Fatalf("待审评论不应出现在公开列表，实际 %d 条", len(listed.Items))
	}

	resp = app.request(t, http.MethodGet, "/api/admin/comments?status=pending", nil)
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusOK)

	var pending model.PageResult[model.Comment]
	decode(t, resp, &pending)
	if pending.Total != 1 {
		t.Fatalf("应有 1 条待审评论，实际 %d", pending.Total)
	}

	commentID := pending.Items[0].ID
	resp = app.request(t, http.MethodPatch, "/api/admin/comments/"+strconv.FormatInt(commentID, 10), map[string]string{
		"status": "approved",
	})
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusNoContent)

	resp = app.request(t, http.MethodGet, "/api/posts/"+post.Slug+"/comments", nil)
	defer resp.Body.Close()
	decode(t, resp, &listed)
	if len(listed.Items) != 1 {
		t.Fatalf("审核通过后应可见 1 条评论，实际 %d", len(listed.Items))
	}
}

func TestCommentValidation(t *testing.T) {
	app := newTestApp(t)

	post := createPost(t, app, model.PostInput{
		Title:   "评论校验",
		Content: "正文",
		Status:  model.PostPublished,
	})

	resp := app.request(t, http.MethodPost, "/api/posts/"+post.Slug+"/comments", model.CommentInput{
		Author:  "",
		Email:   "not-an-email",
		Website: "ftp://example.com",
		Content: "",
	})
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusBadRequest)

	var body struct {
		Fields map[string]string `json:"fields"`
	}
	decode(t, resp, &body)
	for _, field := range []string{"author", "email", "website", "content"} {
		if body.Fields[field] == "" {
			t.Errorf("缺少字段 %q 的错误提示，实际 %v", field, body.Fields)
		}
	}
}

func TestCommentOnUnknownPost(t *testing.T) {
	app := newTestApp(t)

	resp := app.request(t, http.MethodPost, "/api/posts/not-exist/comments", model.CommentInput{
		Author:  "访客",
		Content: "你好",
	})
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusNotFound)
}

func TestSettingsRoundTrip(t *testing.T) {
	app := newTestApp(t)

	resp := app.request(t, http.MethodPut, "/api/admin/settings", model.Settings{
		Title:       "新标题",
		Subtitle:    "新副标题",
		Description: "新的描述",
		Author:      "作者",
		CommentNeed: false,
	})
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusOK)

	resp = app.request(t, http.MethodGet, "/api/site", nil)
	defer resp.Body.Close()

	var site struct {
		Settings model.Settings `json:"settings"`
	}
	decode(t, resp, &site)
	if site.Settings.Title != "新标题" {
		t.Errorf("标题未持久化: %q", site.Settings.Title)
	}
	if site.Settings.CommentNeed {
		t.Error("审核开关未持久化")
	}
}

func TestSettingsVersesValidation(t *testing.T) {
	app := newTestApp(t)

	// 留白与空行应被去除，按非空行保存
	resp := app.request(t, http.MethodPut, "/api/admin/settings", model.Settings{
		Title:  "标题",
		Verses: "\n  北冥有鱼，其名为鳍。  \n\n鹏之徙于南冥也。\n",
	})
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusOK)

	resp = app.request(t, http.MethodGet, "/api/site", nil)
	defer resp.Body.Close()
	var site struct {
		Settings model.Settings `json:"settings"`
	}
	decode(t, resp, &site)
	if want := "北冥有鱼，其名为鳍。\n鹏之徙于南冥也。"; site.Settings.Verses != want {
		t.Errorf("诗句未按行规整: %q", site.Settings.Verses)
	}
}

func TestSettingsVersesRejectsTooManyLines(t *testing.T) {
	app := newTestApp(t)

	lines := make([]string, 0, 21)
	for i := 0; i < 21; i++ {
		lines = append(lines, "第 "+strconv.Itoa(i+1)+" 句")
	}
	resp := app.request(t, http.MethodPut, "/api/admin/settings", model.Settings{
		Title:  "标题",
		Verses: strings.Join(lines, "\n"),
	})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("超过 20 句应返回 400，实际 %d", resp.StatusCode)
	}

	var body struct {
		Fields map[string]string `json:"fields"`
	}
	decode(t, resp, &body)
	if body.Fields["verses"] == "" {
		t.Errorf("应在 verses 字段上返回提示，实际 %v", body.Fields)
	}
}

func TestDeletePostRemovesComments(t *testing.T) {
	app := newTestApp(t)

	post := createPost(t, app, model.PostInput{
		Title:   "待删除",
		Content: "正文",
		Status:  model.PostPublished,
	})

	resp := app.request(t, http.MethodPost, "/api/posts/"+post.Slug+"/comments", model.CommentInput{
		Author:  "访客",
		Content: "评论内容",
	})
	resp.Body.Close()

	resp = app.request(t, http.MethodDelete, "/api/admin/posts/"+strconv.FormatInt(post.ID, 10), nil)
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusNoContent)

	resp = app.request(t, http.MethodGet, "/api/admin/comments", nil)
	defer resp.Body.Close()

	var comments model.PageResult[model.Comment]
	decode(t, resp, &comments)
	if comments.Total != 0 {
		t.Errorf("文章删除后评论应级联删除，实际剩余 %d 条", comments.Total)
	}
}

func TestArchiveGroupsByMonth(t *testing.T) {
	app := newTestApp(t)

	createPost(t, app, model.PostInput{Title: "第一篇", Content: "正文", Status: model.PostPublished})
	createPost(t, app, model.PostInput{Title: "第二篇", Content: "正文", Status: model.PostPublished})

	resp := app.request(t, http.MethodGet, "/api/archive", nil)
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusOK)

	var archive struct {
		Items []model.ArchiveGroup `json:"items"`
	}
	decode(t, resp, &archive)
	if len(archive.Items) != 1 {
		t.Fatalf("同月文章应聚合为一组，实际 %d 组", len(archive.Items))
	}
	if len(archive.Items[0].Posts) != 2 {
		t.Errorf("分组应包含 2 篇，实际 %d", len(archive.Items[0].Posts))
	}
	if !strings.Contains(archive.Items[0].Month, "-") {
		t.Errorf("月份格式应为 YYYY-MM，实际 %q", archive.Items[0].Month)
	}
}

func TestFeedAndSitemap(t *testing.T) {
	app := newTestApp(t)

	post := createPost(t, app, model.PostInput{
		Title:   "订阅测试",
		Content: "正文内容",
		Status:  model.PostPublished,
	})

	resp := app.request(t, http.MethodGet, "/rss.xml", nil)
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusOK)
	if ct := resp.Header.Get("Content-Type"); !strings.Contains(ct, "rss") {
		t.Errorf("RSS 内容类型不正确: %q", ct)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), post.Title) {
		t.Errorf("RSS 应包含文章标题: %s", body)
	}

	resp = app.request(t, http.MethodGet, "/sitemap.xml", nil)
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusOK)
	body, _ = io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "/posts/"+post.Slug) {
		t.Errorf("站点地图应包含文章地址: %s", body)
	}
}

func TestSPAFallbackServesIndex(t *testing.T) {
	app := newTestApp(t)

	resp := app.request(t, http.MethodGet, "/posts/some-deep-link", nil)
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusOK)
	if ct := resp.Header.Get("Content-Type"); !strings.Contains(ct, "text/html") {
		t.Errorf("前端路由应回退到 index.html，实际内容类型 %q", ct)
	}
}

func TestUnknownAPIReturns404(t *testing.T) {
	app := newTestApp(t)

	resp := app.request(t, http.MethodGet, "/api/not-exist", nil)
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusNotFound)
}

func TestChangePassword(t *testing.T) {
	app := newTestApp(t)

	resp := app.request(t, http.MethodPost, "/api/auth/password", map[string]string{
		"oldPassword": "admin123",
		"newPassword": "new-secret-123",
	})
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusNoContent)

	resp = app.request(t, http.MethodPost, "/api/auth/login", map[string]string{
		"username": "admin",
		"password": "new-secret-123",
	})
	defer resp.Body.Close()
	expectStatus(t, resp, http.StatusOK)
}
