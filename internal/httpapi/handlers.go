package httpapi

import (
	"net/http"
	"strconv"

	"goblog/internal/model"
	"goblog/internal/service"
	"goblog/internal/store"
)

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleSite(w http.ResponseWriter, r *http.Request) {
	settings, err := s.settings.Get(r.Context())
	if err != nil {
		writeServiceError(w, err)
		return
	}
	tags, err := s.posts.Tags(r.Context())
	if err != nil {
		writeServiceError(w, err)
		return
	}
	categories, err := s.posts.Categories(r.Context())
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"settings":   settings,
		"tags":       tags,
		"categories": categories,
	})
}

func (s *Server) handlePublicPosts(w http.ResponseWriter, r *http.Request) {
	result, err := s.posts.PublicList(r.Context(), postFilterFrom(r, 10))
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handlePublicPost(w http.ResponseWriter, r *http.Request) {
	detail, err := s.posts.PublicDetail(r.Context(), r.PathValue("slug"))
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (s *Server) handlePublicComments(w http.ResponseWriter, r *http.Request) {
	comments, err := s.comments.ListApproved(r.Context(), r.PathValue("slug"))
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": comments})
}

func (s *Server) handleCreateComment(w http.ResponseWriter, r *http.Request) {
	var input model.CommentInput
	if !decodeJSON(w, r, &input) {
		return
	}
	comment, visible, err := s.comments.Submit(r.Context(), r.PathValue("slug"), input)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	status := http.StatusCreated
	writeJSON(w, status, map[string]any{
		"comment": comment,
		"visible": visible,
		"message": commentResultMessage(visible),
	})
}

func commentResultMessage(visible bool) string {
	if visible {
		return "评论已发布"
	}
	return "评论已提交，通过审核后展示"
}

func (s *Server) handleTags(w http.ResponseWriter, r *http.Request) {
	tags, err := s.posts.Tags(r.Context())
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": tags})
}

func (s *Server) handleCategories(w http.ResponseWriter, r *http.Request) {
	categories, err := s.posts.Categories(r.Context())
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": categories})
}

func (s *Server) handleArchive(w http.ResponseWriter, r *http.Request) {
	groups, err := s.posts.Archive(r.Context())
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": groups})
}

func (s *Server) handleRecentComments(w http.ResponseWriter, r *http.Request) {
	limit := intQuery(r, "limit", 5)
	comments, err := s.comments.Recent(r.Context(), limit)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": comments})
}

func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	stats, err := s.posts.Stats(r.Context())
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

func (s *Server) handleAdminPosts(w http.ResponseWriter, r *http.Request) {
	filter := postFilterFrom(r, 10)
	if status := stringQuery(r, "status"); status != "" {
		postStatus := model.PostStatus(status)
		if !postStatus.Valid() {
			writeFieldsError(w, "状态参数不合法", map[string]string{"status": "只能是 draft 或 published"})
			return
		}
		filter.Status = postStatus
	}
	result, err := s.posts.AdminList(r.Context(), filter)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleAdminPost(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	post, err := s.posts.AdminGet(r.Context(), id)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, post)
}

func (s *Server) handleCreatePost(w http.ResponseWriter, r *http.Request) {
	var input model.PostInput
	if !decodeJSON(w, r, &input) {
		return
	}
	post, err := s.posts.Create(r.Context(), input)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, post)
}

func (s *Server) handleUpdatePost(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var input model.PostInput
	if !decodeJSON(w, r, &input) {
		return
	}
	post, err := s.posts.Update(r.Context(), id, input)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, post)
}

func (s *Server) handleDeletePost(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := s.posts.Delete(r.Context(), id); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAdminComments(w http.ResponseWriter, r *http.Request) {
	page, pageSize := pageQuery(r, 20)
	filter := commentFilter(page, pageSize)
	if raw := stringQuery(r, "status"); raw != "" {
		filter.Status = model.CommentStatus(raw)
	}
	if raw := stringQuery(r, "postId"); raw != "" {
		postID, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || postID <= 0 {
			writeFieldsError(w, "文章参数不合法", map[string]string{"postId": "必须是正整数"})
			return
		}
		filter.PostID = postID
	}
	result, err := s.comments.AdminList(r.Context(), filter)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleModerateComment(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var payload struct {
		Status model.CommentStatus `json:"status"`
	}
	if !decodeJSON(w, r, &payload) {
		return
	}
	if err := s.comments.Moderate(r.Context(), id, payload.Status); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleDeleteComment(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := s.comments.Delete(r.Context(), id); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := s.settings.Get(r.Context())
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

func (s *Server) handleSaveSettings(w http.ResponseWriter, r *http.Request) {
	var input model.Settings
	if !decodeJSON(w, r, &input) {
		return
	}
	settings, err := s.settings.Save(r.Context(), input)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &payload) {
		return
	}
	session, err := s.auth.Login(r.Context(), payload.Username, payload.Password)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	claims, ok := claimsFrom(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "请先登录")
		return
	}
	profile, err := s.auth.Profile(r.Context(), claims.UserID)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, profile)
}

func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	claims, ok := claimsFrom(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "请先登录")
		return
	}
	var payload struct {
		OldPassword string `json:"oldPassword"`
		NewPassword string `json:"newPassword"`
	}
	if !decodeJSON(w, r, &payload) {
		return
	}
	if err := s.auth.ChangePassword(r.Context(), claims.UserID, payload.OldPassword, payload.NewPassword); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleUpload 接收 multipart 图片并保存到上传目录。
func (s *Server) handleUpload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, service.MaxUploadBytes+1<<20)
	file, header, err := r.FormFile("file")
	if err != nil {
		writeFieldsError(w, "读取上传文件失败", map[string]string{"file": "请选择要上传的图片"})
		return
	}
	defer file.Close()

	result, err := s.media.Save(file, header.Filename)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, result)
}

// handleFallback 处理非 GET/HEAD 的未知路径。
func (s *Server) handleFallback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeError(w, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}
	http.NotFound(w, r)
}

func commentFilter(page, pageSize int) store.CommentFilter {
	return store.CommentFilter{Page: page, PageSize: pageSize}
}
