package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"goblog/internal/service"
	"goblog/internal/store"
)

// maxJSONBody 限制 JSON 请求体大小，防止超长正文占用内存。
const maxJSONBody = 2 << 20

// apiError 是统一的错误响应体。
type apiError struct {
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if payload == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		// 响应已开始写出，只能记录日志。
		slog.Error("写入 JSON 响应失败", "err", err)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, apiError{Message: message})
}

func writeFieldsError(w http.ResponseWriter, message string, fields map[string]string) {
	writeJSON(w, http.StatusBadRequest, apiError{Message: message, Fields: fields})
}

// writeServiceError 把 service 层与 store 层错误映射为 HTTP 状态码。
// 未识别的错误一律记录日志并返回 500，不向客户端泄露内部细节。
func writeServiceError(w http.ResponseWriter, err error) {
	var validation *service.ValidationError
	switch {
	case errors.As(err, &validation):
		writeFieldsError(w, validation.Error(), validation.Fields)
	case errors.Is(err, service.ErrInvalidCredentials):
		writeError(w, http.StatusUnauthorized, "用户名或密码错误")
	case errors.Is(err, service.ErrNotFound), errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "请求的内容不存在")
	case errors.Is(err, service.ErrUnsupportedFormat):
		writeFieldsError(w, err.Error(), map[string]string{"file": "仅支持 JPG、PNG、GIF、WebP、SVG"})
	case errors.Is(err, service.ErrFileTooLarge):
		writeFieldsError(w, err.Error(), map[string]string{"file": "图片不能超过 8MB"})
	default:
		slog.Error("处理请求失败", "err", err)
		writeError(w, http.StatusInternalServerError, "服务器内部错误，请稍后重试")
	}
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxJSONBody)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		message := "请求体格式不正确"
		if errors.Is(err, io.EOF) {
			message = "请求体不能为空"
		}
		writeError(w, http.StatusBadRequest, message)
		return false
	}
	return true
}

// pathID 解析路径中的数字主键。
func pathID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	raw := r.PathValue("id")
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, "无效的资源标识")
		return 0, false
	}
	return id, true
}

// intQuery 读取整型查询参数，非法值回退到默认值。
func intQuery(r *http.Request, key string, fallback int) int {
	raw := r.URL.Query().Get(key)
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}

// stringQuery 读取去除首尾空白的字符串查询参数。
func stringQuery(r *http.Request, key string) string {
	return strings.TrimSpace(r.URL.Query().Get(key))
}

// pageQuery 解析通用分页参数。
func pageQuery(r *http.Request, defaultSize int) (page int, pageSize int) {
	page = intQuery(r, "page", 1)
	if page < 1 {
		page = 1
	}
	pageSize = intQuery(r, "pageSize", defaultSize)
	if pageSize < 1 {
		pageSize = defaultSize
	}
	if pageSize > 100 {
		pageSize = 100
	}
	return page, pageSize
}

// postFilterFrom 依据查询参数构造文章过滤条件。
func postFilterFrom(r *http.Request, defaultSize int) store.PostFilter {
	page, pageSize := pageQuery(r, defaultSize)
	return store.PostFilter{
		Category: stringQuery(r, "category"),
		Tag:      stringQuery(r, "tag"),
		Query:    stringQuery(r, "q"),
		Featured: r.URL.Query().Get("featured") == "true",
		Page:     page,
		PageSize: pageSize,
	}
}
