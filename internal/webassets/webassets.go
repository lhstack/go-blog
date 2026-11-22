// Package webassets 内嵌前端构建产物，使后端二进制可单文件部署。
//
// dist 目录平时只有 .gitkeep，由 `make web`（vite build）填充真实产物。
// 未构建时后端仍可启动，此时前端请求会收到一段说明页面。
package webassets

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// dist 由前端构建生成；`all:` 前缀保证 .gitkeep 之类的点文件也会被嵌入，
// 从而在没有构建产物的仓库中等价于一个空目录也能通过编译。
//
//go:embed all:dist
var embedded embed.FS

// FS 返回以 dist 为根的文件系统。
func FS() fs.FS {
	sub, err := fs.Sub(embedded, "dist")
	if err != nil {
		// 编译期已保证 dist 存在，此处不可达。
		panic("webassets: 内嵌资源缺失: " + err.Error())
	}
	return sub
}

// Handler 返回前端静态资源处理器。带内容哈希的 assets/ 文件可长期缓存，
// 其它文件（如 index.html）要求每次校验。
func Handler() http.Handler {
	root := FS()
	server := http.FileServer(http.FS(root))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clean := path.Clean("/" + strings.TrimPrefix(r.URL.Path, "/"))
		if strings.HasPrefix(clean, "/assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		server.ServeHTTP(w, r)
	})
}

// MissingPage 是前端尚未构建时返回的说明页面。
const MissingPage = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>前端尚未构建</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        background: #0f1115;
        color: #e6e8eb;
      }
      main { max-width: 34rem; padding: 2.5rem; line-height: 1.8; }
      code { background: #1c2027; padding: 0.15rem 0.4rem; border-radius: 6px; font-size: 0.9em; }
      h1 { font-size: 1.35rem; margin: 0 0 1rem; }
      p { margin: 0.5rem 0; color: #9aa4b2; }
      a { color: #58a6ff; }
    </style>
  </head>
  <body>
    <main>
      <h1>前端尚未构建</h1>
      <p>后端已经在运行，但内嵌的前端资源还没有构建。</p>
      <p>在项目根目录执行 <code>make web</code>（或进入 <code>web/</code> 执行 <code>npm install &amp;&amp; npm run build</code>），然后重启服务。</p>
      <p>API 已在正常工作，可以先访问 <a href="/api/health">/api/health</a> 与 <a href="/api/posts">/api/posts</a> 确认。</p>
    </main>
  </body>
</html>
`
