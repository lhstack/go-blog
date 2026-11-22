package service

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"goblog/internal/model"
	"goblog/internal/store"
)

// SettingsService 负责站点配置的读取、默认值合并与保存。
type SettingsService struct {
	store *store.SettingsStore
}

// NewSettingsService 构造配置服务。
func NewSettingsService(settings *store.SettingsStore) *SettingsService {
	return &SettingsService{store: settings}
}

// Get 读取配置，缺失项使用默认值。
func (s *SettingsService) Get(ctx context.Context) (*model.Settings, error) {
	values, err := s.store.Load(ctx)
	if err != nil {
		return nil, err
	}
	return fromMap(values), nil
}

// Save 校验并持久化配置。布尔值以 "true"/"false" 文本存取，与表单提交保持一致。
func (s *SettingsService) Save(ctx context.Context, input model.Settings) (*model.Settings, error) {
	collector := &fieldCollector{}
	settings := model.Settings{
		Title:       required(collector, "title", input.Title, "请填写站点标题", 60),
		Subtitle:    optional(collector, "subtitle", input.Subtitle, 120),
		Description: optional(collector, "description", input.Description, 300),
		Author:      optional(collector, "author", input.Author, 40),
		Avatar:      optional(collector, "avatar", input.Avatar, 500),
		Cover:       optional(collector, "cover", input.Cover, 500),
		Footer:      optional(collector, "footer", input.Footer, 200),
		GitHub:      optional(collector, "github", input.GitHub, 200),
		Email:       optional(collector, "email", input.Email, 120),
		ICP:         optional(collector, "icp", input.ICP, 60),
		Verses:      verses(collector, input.Verses),
		CommentNeed: input.CommentNeed,
	}
	if err := collector.err(); err != nil {
		return nil, err
	}
	if err := s.store.Save(ctx, toMap(settings)); err != nil {
		return nil, err
	}
	return &settings, nil
}

func fromMap(values map[string]string) *model.Settings {
	defaults := model.DefaultSettings()
	pick := func(key, fallback string) string {
		if value, ok := values[key]; ok {
			return value
		}
		return fallback
	}

	settings := &model.Settings{
		Title:       pick("title", defaults.Title),
		Subtitle:    pick("subtitle", defaults.Subtitle),
		Description: pick("description", defaults.Description),
		Author:      pick("author", defaults.Author),
		Avatar:      pick("avatar", defaults.Avatar),
		Cover:       pick("cover", defaults.Cover),
		Footer:      pick("footer", defaults.Footer),
		GitHub:      pick("github", defaults.GitHub),
		Email:       pick("email", defaults.Email),
		ICP:         pick("icp", defaults.ICP),
		Verses:      pick("verses", defaults.Verses),
		CommentNeed: defaults.CommentNeed,
	}
	if raw, ok := values["commentNeed"]; ok {
		parsed, err := strconv.ParseBool(raw)
		if err == nil {
			settings.CommentNeed = parsed
		}
	}
	if strings.TrimSpace(settings.Title) == "" {
		settings.Title = defaults.Title
	}
	return settings
}

func toMap(settings model.Settings) map[string]string {
	return map[string]string{
		"title":       settings.Title,
		"subtitle":    settings.Subtitle,
		"description": settings.Description,
		"author":      settings.Author,
		"avatar":      settings.Avatar,
		"cover":       settings.Cover,
		"footer":      settings.Footer,
		"github":      settings.GitHub,
		"email":       settings.Email,
		"icp":         settings.ICP,
		"verses":      settings.Verses,
		"commentNeed": strconv.FormatBool(settings.CommentNeed),
	}
}

// maxVerseLines / maxVerseLength 限制卷首诗句的行数与单行长度，
// 避免首页轮播的文案过长影响版式。
const (
	maxVerseLines  = 20
	maxVerseLength = 60
)

// verses 校验卷首诗句：按行拆分、去除空行，限制行数与单行长度。
// 全部留空表示不展示卷首诗，由前端按空值隐去；不在此处补默认值。
func verses(collector *fieldCollector, value string) string {
	lines := make([]string, 0, 8)
	for _, line := range strings.Split(value, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if len([]rune(trimmed)) > maxVerseLength {
			collector.add("verses", fmt.Sprintf("每句不超过 %d 个字符", maxVerseLength))
			return ""
		}
		lines = append(lines, trimmed)
	}
	if len(lines) > maxVerseLines {
		collector.add("verses", fmt.Sprintf("最多 %d 句", maxVerseLines))
		return ""
	}
	return strings.Join(lines, "\n")
}
