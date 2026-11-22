# AGENTS.md

本文件记录本项目已确认的工程约定。只写有文件、配置或测试证据支持的结论；未确认的内容不得猜测补全。

## 项目概述

goblog 是一个自托管个人博客系统：

- Go 后端（标准库 `net/http` + SQLite），同时提供 JSON API、RSS、站点地图、上传文件与 SPA 静态资源托管；
- React + TypeScript + Ant Design 前端，由 Vite 构建；
- 前端构建产物通过 `embed` 打进 Go 二进制，单文件部署。

## 工程环境与主要工具

- 操作系统：Alpine Linux 3.23（容器内），架构 x86_64。
- Go：`/usr/local/go`（当前 1.27.x），不在默认 PATH，需要 `export PATH=$PATH:/usr/local/go/bin`。
- Go 模块代理：`GOPROXY=https://goproxy.cn,direct`，`GOSUMDB=sum.golang.google.cn`（已通过 `go env -w` 写入）。
- SQLite 驱动：`modernc.org/sqlite`（纯 Go，无需 CGO）。
- Node.js 24 / npm 11；npm registry 已设为 `https://registry.npmmirror.com`。
- 前端依赖：React 18、antd 5、Vite 7、TypeScript 5、react-router-dom 7、markdown-it 14、highlight.js 11、dompurify 3。
- 端到端验证：Playwright + 系统 `apk add chromium`（Playwright 自带 headless shell 在 Alpine 缺 glibc 无法启动）。

## 目录与模块结构

```
cmd/server/           程序入口：配置、数据库、构造服务、HTTP Server、优雅退出
cmd/seed/             写入示例文章/评论/站点设置（幂等）
internal/config/      环境变量配置与 JWT 密钥落盘
internal/database/    SQLite 连接池（WAL/外键/busy_timeout）与内嵌 schema.sql
internal/model/       领域结构与 API 序列化结构
internal/store/       数据访问层，全部 SQL 只出现在这里
internal/service/     业务层：鉴权、文章、评论、站点设置、图片上传
internal/markdown/    Markdown → HTML（goldmark GFM）、纯文本摘要、阅读时长
internal/httpapi/     HTTP 层：路由、中间件、处理器、RSS/sitemap、SPA 回退
internal/webassets/   前端产物 embed；未构建时返回说明页
web/                  前端源码（Vite + React + TS + antd）
data/                 运行时数据：goblog.db、jwt.secret、uploads/（不入库）
```

## 分层架构与依赖方向

依赖方向单向：`cmd → httpapi → service → store → database`；`model`、`markdown`、`webassets` 为底层公共包。

- 只允许 `store` 包出现 SQL；`service` 负责校验、业务规则与事务内的数据一致性判断。
- `httpapi` 只做参数解析、调用 service、写响应，不写业务规则。
- 数据访问一律使用预编译参数，禁止拼接 SQL 值。
- 时间字段统一以 RFC3339 UTC 字符串存储，便于字典序比较；解析集中在 `store.parseTime`。

## 构建、测试和验证方式

- 后端构建：`make build`（等价 `go build ./cmd/server`，输出 `bin/goblog`）。
- 后端测试：`go test ./...`。测试使用 `t.TempDir()` 中的真实 SQLite 文件，不触碰 `data/`。
- 前端开发：`make dev` 或 `cd web && npm run dev`（5173，代理 `/api`、`/uploads`、`/rss.xml` 到 `:8080`）。
- 前端构建：`make web`，产物输出到 `internal/webassets/dist`（该目录下只有 `.gitkeep` 入库）。
- 全量构建：`make all`，随后 `./bin/goblog` 单进程提供站点。
- 提交前至少执行：`go vet ./...`、`go test ./...`、`cd web && npm run typecheck`（等价 `make test`）。
- 修改前端后必须重新 `npm run build`，否则 Go 二进制里仍是旧的嵌入资源。

## 项目编码约定

- Go：标准库风格；错误用 `fmt.Errorf("...: %w", err)` 包装；`gofmt` 必须通过。
- 函数短小，遵循 Composed Method / SLAP；命名表达意图，避免无意义缩写。
- HTTP 错误统一 JSON 结构 `{"message": ..., "fields": {...}}`，由 `writeServiceError` 集中映射状态码。
- TypeScript：`strict` 开启，`noUnusedLocals`/`noUnusedParameters` 开启；API 类型集中在 `web/src/api/types.ts`，网络请求集中在 `web/src/api/client.ts`。
- 组件分层：通用组件在 `web/src/components`，页面在 `web/src/pages`，后台页面在 `web/src/pages/admin`。
- 页面级数据请求统一用 `web/src/lib/useAsync`（内置 AbortController），不要裸用 `useEffect + fetch`。
- 路由按需懒加载：首页同步加载，其余页面与整个后台使用 `lazy`；新增页面时保持这一约定。
- 样式集中在 `web/src/index.css`，优先使用 antd 组件与 theme token，不引入 CSS 框架。
- 响应式：≤960px 切换为单列布局并启用抽屉导航（`.site-nav-toggle`）。

## 错误处理约定

- 字段校验失败由 service 返回 `*service.ValidationError`（可累积多个字段），HTTP 层转 400 并返回 `fields`。
- 可预期错误显式映射：未登录/令牌失效 401、资源不存在 404、冲突 409。
- 内部错误记录 slog 并返回 500，不向客户端泄露细节；不在 HTTP 层兜底吞掉 service 错误。
- 没有明确契约时不加静默 fallback、降级或默认值。

## 安全约定

- 密码使用 bcrypt；JWT 使用 HS256，密钥优先取 `GOBLOG_JWT_SECRET`，否则首次启动生成并写入 `data/jwt.secret`（0600）。
- 上传只信任 `http.DetectContentType` 嗅探结果，按类型决定扩展名，文件名随机生成，单文件上限 8MB。
- 正文 HTML 由 goldmark 渲染并持久化；前端展示用 DOMPurify 再净化一次。

## 版本控制信息

- 当前目录不是 git 仓库，无提交历史。用户身份与个人编码习惯：未确认，不得根据猜测补充。

## 当前无法确认的事项

- 生产部署方式（反向代理、TLS 终止位置）未确认。
- 是否需要多用户/多作者能力未确认（当前实现为单管理员）。
- 生产环境是否使用 Docker 部署未确认（仓库提供了 Dockerfile 与 compose 文件，尚未在本机构建验证）。
