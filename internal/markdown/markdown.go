// Package markdown 负责把 Markdown 源文渲染为可直接展示的 HTML，
// 并派生出摘要、阅读时长等展示所需信息。
package markdown

import (
	"bytes"
	"fmt"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer/html"
)

// Renderer 复用同一个 goldmark 实例，渲染过程无状态，可并发调用。
type Renderer struct {
	md goldmark.Markdown
}

// New 构造渲染器，启用 GFM（表格、删除线、任务列表、自动链接）与代码高亮类名。
func New() *Renderer {
	return &Renderer{
		md: goldmark.New(
			goldmark.WithExtensions(extension.GFM, extension.Footnote),
			goldmark.WithParserOptions(parser.WithAutoHeadingID()),
			goldmark.WithRendererOptions(html.WithUnsafe()),
		),
	}
}

// Render 把 Markdown 转为 HTML 字符串。
func (r *Renderer) Render(source string) (string, error) {
	var buf bytes.Buffer
	if err := r.md.Convert([]byte(source), &buf); err != nil {
		return "", fmt.Errorf("渲染 Markdown: %w", err)
	}
	return buf.String(), nil
}

var (
	headingPattern   = regexp.MustCompile(`(?m)^#{1,6}\s`)
	codeFencePattern = regexp.MustCompile("(?m)^```")
	imagePattern     = regexp.MustCompile(`!\[[^\]]*\]\([^)]*\)`)
	linkPattern      = regexp.MustCompile(`\[([^\]]*)\]\([^)]*\)`)
	inlineCode       = regexp.MustCompile("`[^`]*`")
	emphasis         = regexp.MustCompile(`[*_~>#]+`)
	htmlTag          = regexp.MustCompile(`<[^>]*>`)
)

// PlainText 剥离 Markdown 语法，得到适合摘要、RSS 与搜索提示的纯文本。
func PlainText(source string) string {
	text := imagePattern.ReplaceAllString(source, "")
	text = linkPattern.ReplaceAllString(text, "$1")
	text = inlineCode.ReplaceAllString(text, " ")
	text = headingPattern.ReplaceAllString(text, "")
	text = codeFencePattern.ReplaceAllString(text, "")
	text = htmlTag.ReplaceAllString(text, "")
	text = emphasis.ReplaceAllString(text, "")
	return strings.Join(strings.Fields(text), " ")
}

// Excerpt 截取最多 limit 个字符的纯文本摘要，超出部分用省略号收尾。
func Excerpt(source string, limit int) string {
	plain := PlainText(source)
	if limit <= 0 || utf8.RuneCountInString(plain) <= limit {
		return plain
	}
	runes := []rune(plain)
	return string(runes[:limit]) + "…"
}

// ReadingTime 以中文 350 字/分钟、英文 200 词/分钟的粗略速度估算阅读时长，
// 返回值单位为分钟且至少为 1。
func ReadingTime(source string) int {
	plain := PlainText(source)
	var cjk, latin int
	inWord := false
	for _, r := range plain {
		switch {
		case unicode.Is(unicode.Han, r):
			cjk++
			inWord = false
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			if !inWord {
				latin++
				inWord = true
			}
		default:
			inWord = false
		}
	}
	minutes := float64(cjk)/350 + float64(latin)/200
	if minutes < 1 {
		return 1
	}
	return int(minutes + 0.5)
}
