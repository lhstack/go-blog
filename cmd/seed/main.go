// Command seed 写入一批示例文章、评论与站点设置，便于本地预览效果。
// 该命令幂等：已存在同别名文章或已有账号时不会重复写入。
package main

import (
	"context"
	"errors"
	"fmt"
	"os"

	"goblog/internal/config"
	"goblog/internal/database"
	"goblog/internal/markdown"
	"goblog/internal/model"
	"goblog/internal/service"
	"goblog/internal/store"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "写入示例数据失败:", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx := context.Background()

	db, err := database.Open(ctx, cfg.DatabaseDSN)
	if err != nil {
		return err
	}
	defer db.Close()

	repo := store.New(db)
	renderer := markdown.New()
	settings := service.NewSettingsService(repo.Conf)
	posts := service.NewPostService(repo.Post, repo.Tag, renderer)
	comments := service.NewCommentService(repo.Cmt, repo.Post, settings)

	if _, err := settings.Save(ctx, model.Settings{
		Title:       "晨间笔记",
		Subtitle:    "记录技术与生活的细枝末节",
		Description: "这里记录 Go、前端工程与日常阅读的思考，偶尔也写一点生活琐事。",
		Author:      "站长",
		Footer:      "由 Go + SQLite + React 驱动",
		GitHub:      "https://github.com/",
		Email:       "hi@example.com",
		Verses:      model.DefaultVerses,
		CommentNeed: true,
	}); err != nil {
		return err
	}

	seeded := 0
	for _, seed := range seeds() {
		if _, err := repo.Post.GetPublishedBySlug(ctx, seed.Slug); err == nil {
			fmt.Printf("跳过已存在的文章：%s\n", seed.Slug)
			continue
		} else if !errors.Is(err, store.ErrNotFound) {
			return err
		}

		post, err := posts.Create(ctx, seed)
		if err != nil {
			return fmt.Errorf("写入 %s: %w", seed.Title, err)
		}
		seeded++
		fmt.Printf("已写入文章：%s（/posts/%s）\n", post.Title, post.Slug)

		for _, comment := range seedComments(seed.Slug) {
			submitted, _, err := comments.Submit(ctx, seed.Slug, comment)
			if err != nil {
				return fmt.Errorf("写入评论: %w", err)
			}
			if err := comments.Moderate(ctx, submitted.ID, model.CommentApproved); err != nil {
				return fmt.Errorf("审核评论: %w", err)
			}
		}
	}

	if seeded == 0 {
		fmt.Println("没有新增示例文章。")
	}
	return nil
}

func seeds() []model.PostInput {
	return []model.PostInput{
		{
			Title:    "用 Go 标准库搭一个能跑的博客后端",
			Slug:     "go-stdlib-blog-backend",
			Summary:  "从路由、中间件到 JSON 响应，看看 modern Go 的 net/http 能走多远。",
			Category: "Go",
			Status:   model.PostPublished,
			Featured: true,
			Tags:     []string{"Go", "HTTP", "后端"},
			Content: `从 Go 1.22 开始，` + "`net/http`" + ` 的 ServeMux 支持方法与路径参数匹配，这让很多轻量服务不再需要第三方路由库。

## 路由写法

注册路由时直接声明方法与占位符：

` + "```go" + `
mux.HandleFunc("GET /api/posts", s.handlePublicPosts)
mux.HandleFunc("GET /api/posts/{slug}", s.handlePublicPost)
mux.HandleFunc("POST /api/admin/posts", s.withAuth(s.handleCreatePost))
` + "```" + `

处理器里用 ` + "`r.PathValue(\"slug\")`" + ` 读取参数。

## 中间件顺序

中间件按“外层负责横切关注点”的顺序组合：

1. 日志：记录所有请求，包括被拒绝的；
2. panic 恢复：确保单个请求异常不会打挂进程；
3. 安全响应头；
4. CORS：只在本地开发时放开来源。

## 优雅关闭

用 ` + "`signal.NotifyContext`" + ` 接管 SIGINT/SIGTERM，再调用 ` + "`server.Shutdown`" + ` 给在途请求留出时间。

> 这类基础能力，标准库已经足够好，把复杂度留给真正的业务。
`,
		},
		{
			Title:    "SQLite 在小型服务里到底够不够用",
			Slug:     "sqlite-for-small-services",
			Summary:  "WAL、busy_timeout 与单写者模型，决定了 SQLite 的适用边界。",
			Category: "数据库",
			Status:   model.PostPublished,
			Tags:     []string{"SQLite", "数据库"},
			Content: `SQLite 常被贴上“玩具数据库”的标签，但对个人博客、内部工具这类读多写少的场景，它几乎没有对手：零运维、单文件、备份就是复制文件。

## 关键参数

| 参数 | 作用 |
| --- | --- |
| ` + "`journal_mode=WAL`" + ` | 读写并发，读不阻塞写 |
| ` + "`busy_timeout`" + ` | 写锁冲突时等待而不是立刻报错 |
| ` + "`synchronous=NORMAL`" + ` | WAL 下兼顾安全与吞吐 |
| ` + "`foreign_keys=1`" + ` | 打开外键级联 |

## 单写者模型

SQLite 同一时刻只允许一个写事务。因此不要把连接池开得很大，8 个连接通常已经足够；真正的瓶颈是“长事务”，而不是连接数。

## 不适合的场景

- 多机写入；
- 高频写 + 复杂分析查询混跑；
- 需要在线扩容的强一致集群。

选型的关键不是“够不够强”，而是“边界是否匹配”。
`,
		},
		{
			Title:    "React 19 与 antd 5 的配合要点",
			Slug:     "react-antd-integration",
			Summary:  "表单校验、主题 token 与请求取消，是最容易踩坑的三处。",
			Category: "前端",
			Status:   model.PostPublished,
			Tags:     []string{"React", "Ant Design", "TypeScript"},
			Content: `antd 的表单能力很强，但和后端字段级校验配合时需要约定好错误结构。

## 后端返回字段错误

统一的结构：

` + "```json" + `
{ "message": "请求参数不合法", "fields": { "title": "请输入文章标题" } }
` + "```" + `

前端拿到后直接映射到表单项：

` + "```ts" + `
form.setFields(
  Object.entries(err.fields).map(([name, reason]) => ({ name, errors: [reason] })),
)
` + "```" + `

## 主题

用 ` + "`ConfigProvider`" + ` 的 token 覆盖主色与圆角，比逐个组件传样式更稳。

## 请求取消

页面切换时用 ` + "`AbortController`" + ` 中止在途请求，避免旧响应覆盖新数据。封装一个 ` + "`useAsync`" + ` 就能统一处理。

## 编辑器预览

服务端已用 goldmark 渲染正文，前端编辑页的实时预览用 markdown-it，两边都开启 GFM，视觉效果才能对得上。
`,
		},
		{
			Title:    "写作这件小事，值得一套自己的工具",
			Slug:     "writing-with-own-tools",
			Summary:  "把博客搭起来之后，写作才真正开始。",
			Category: "随笔",
			Status:   model.PostPublished,
			Tags:     []string{"随笔", "写作"},
			Content: `买过很多笔记本，用过很多笔记软件，最后发现真正的阻碍不是工具，而是“我还没准备好”。

## 先跑起来

一套能用的博客系统，需求其实很小：

- 能写 Markdown；
- 能发布与撤回；
- 能看评论；
- 能订阅。

把这四件事做顺，写作的阻力就消失了。

## 单文件部署的踏实感

把前端构建产物 embed 进 Go 二进制，再加一个数据目录，就是完整的备份单元。换机器时复制两个东西：可执行文件与 ` + "`data/`" + `。

这种“看得见的完整性”，会让人更愿意长期维护它。
`,
		},
		{
			Title:    "还在整理的一篇草稿",
			Slug:     "draft-in-progress",
			Summary:  "草稿不会出现在前台，只在这里等待被写完。",
			Category: "随笔",
			Status:   model.PostDraft,
			Tags:     []string{"草稿"},
			Content: `这一篇用于演示草稿状态：它可以在后台看到，但前台列表与详情都不可访问。

## 待补充

- [ ] 补充例子
- [ ] 检查链接
- [ ] 决定发布时间
`,
		},
	}
}

func seedComments(slug string) []model.CommentInput {
	switch slug {
	case "go-stdlib-blog-backend":
		return []model.CommentInput{
			{Author: "小林", Email: "lin@example.com", Content: "路径参数这个特性真的省了不少依赖，感谢整理。"},
			{Author: "阿岚", Website: "https://example.org", Content: "中间件顺序那段说得很清楚，日志放最外层确实更合理。"},
		}
	case "sqlite-for-small-services":
		return []model.CommentInput{
			{Author: "老王", Content: "WAL 之后读性能提升明显，但要注意备份时也要处理 -wal 文件。"},
		}
	default:
		return nil
	}
}
