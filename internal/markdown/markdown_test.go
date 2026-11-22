package markdown

import (
	"strings"
	"testing"
)

func TestRenderProducesHTML(t *testing.T) {
	html, err := New().Render("# 标题\n\n正文 **加粗**。")
	if err != nil {
		t.Fatalf("渲染失败: %v", err)
	}
	for _, fragment := range []string{"<h1", "标题", "<strong>加粗</strong>"} {
		if !strings.Contains(html, fragment) {
			t.Errorf("输出缺少 %q，实际为 %q", fragment, html)
		}
	}
}

func TestRenderGFMTable(t *testing.T) {
	html, err := New().Render("| a | b |\n| - | - |\n| 1 | 2 |\n")
	if err != nil {
		t.Fatalf("渲染失败: %v", err)
	}
	if !strings.Contains(html, "<table>") {
		t.Fatalf("GFM 表格未渲染: %q", html)
	}
}

func TestPlainTextStripsMarkup(t *testing.T) {
	source := "# 标题\n\n这是 [链接](https://example.com) 与 `代码`。\n\n```go\nfmt.Println(1)\n```"
	got := PlainText(source)
	for _, unwanted := range []string{"#", "```", "https://example.com", "`"} {
		if strings.Contains(got, unwanted) {
			t.Errorf("纯文本仍包含 %q: %q", unwanted, got)
		}
	}
	if !strings.Contains(got, "链接") {
		t.Errorf("链接文字应保留: %q", got)
	}
}

func TestExcerptTruncatesByRune(t *testing.T) {
	if got := Excerpt("一二三四五六七八九十", 5); got != "一二三四五…" {
		t.Fatalf("期望 5 个字符加省略号，实际 %q", got)
	}
	if got := Excerpt("短文", 5); got != "短文" {
		t.Fatalf("未超限时不应添加省略号，实际 %q", got)
	}
}

func TestReadingTimeAtLeastOneMinute(t *testing.T) {
	if got := ReadingTime("短句"); got != 1 {
		t.Fatalf("极短内容阅读时长应为 1 分钟，实际 %d", got)
	}
	long := strings.Repeat("汉字", 800)
	if got := ReadingTime(long); got < 4 {
		t.Fatalf("1600 字应超过 4 分钟，实际 %d", got)
	}
}
