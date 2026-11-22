package service

import (
	"errors"
	"fmt"
	"strings"
)

// ValidationError 表示请求字段不合法，HTTP 层据此返回 400 与字段级错误。
type ValidationError struct {
	Fields map[string]string
}

func (e *ValidationError) Error() string {
	if len(e.Fields) == 0 {
		return "请求参数不合法"
	}
	parts := make([]string, 0, len(e.Fields))
	for field, message := range e.Fields {
		parts = append(parts, field+": "+message)
	}
	return "请求参数不合法（" + strings.Join(parts, "；") + "）"
}

// NewValidationError 构造单字段校验错误。
func NewValidationError(field, message string) error {
	return &ValidationError{Fields: map[string]string{field: message}}
}

// fieldCollector 累积多个字段的校验错误，避免只报第一个问题。
type fieldCollector struct {
	fields map[string]string
}

func (c *fieldCollector) add(field, message string) {
	if c.fields == nil {
		c.fields = make(map[string]string, 4)
	}
	if _, exists := c.fields[field]; !exists {
		c.fields[field] = message
	}
}

func (c *fieldCollector) err() error {
	if len(c.fields) == 0 {
		return nil
	}
	return &ValidationError{Fields: c.fields}
}

// 领域错误，HTTP 层据此映射状态码。
var (
	ErrInvalidCredentials = errors.New("用户名或密码错误")
	ErrNotFound           = errors.New("资源不存在")
	ErrUnsupportedFormat  = errors.New("不支持的图片格式")
	ErrFileTooLarge       = errors.New("文件超出大小限制")
)

// required 校验必填文本并去除首尾空白。
func required(collector *fieldCollector, field, value, message string, max int) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		collector.add(field, message)
		return ""
	}
	if max > 0 && len([]rune(trimmed)) > max {
		collector.add(field, fmt.Sprintf("不能超过 %d 个字符", max))
	}
	return trimmed
}

// optional 校验可选文本并去除首尾空白。
func optional(collector *fieldCollector, field, value string, max int) string {
	trimmed := strings.TrimSpace(value)
	if max > 0 && len([]rune(trimmed)) > max {
		collector.add(field, fmt.Sprintf("不能超过 %d 个字符", max))
	}
	return trimmed
}
