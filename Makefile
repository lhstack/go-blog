# goblog 常用开发与构建入口。
# 默认目标：显示可用命令。

GO ?= $(shell command -v go 2>/dev/null || echo /usr/local/go/bin/go)
BIN := bin/goblog
DIST := internal/webassets/dist

.PHONY: help
help:
	@echo "make dev      # 启动后端（:8080）与前端开发服务器（:5173）"
	@echo "make server   # 只启动后端"
	@echo "make web      # 构建前端并嵌入 internal/webassets/dist"
	@echo "make build    # 构建后端二进制"
	@echo "make all      # 先构建前端，再构建二进制"
	@echo "make test     # go vet + go test + 前端类型检查"
	@echo "make seed     # 写入示例文章与评论"
	@echo "make run      # 构建并运行二进制"
	@echo "make clean    # 清理构建产物"

.PHONY: dev
dev:
	@echo "后端 → http://127.0.0.1:8080  前端 → http://127.0.0.1:5173"
	@( cd web && npm run dev ) & \
	trap 'kill %1 2>/dev/null' INT TERM EXIT; \
	$(GO) run ./cmd/server

.PHONY: server
server:
	$(GO) run ./cmd/server

.PHONY: web
web:
	@cd web && npm ci --no-audit --no-fund && npm run build

.PHONY: build
build:
	@mkdir -p bin
	$(GO) build -trimpath -ldflags="-s -w" -o $(BIN) ./cmd/server
	@echo "已生成 $(BIN)"

.PHONY: all
all: web build

.PHONY: test
test:
	$(GO) vet ./...
	$(GO) test ./...
	@cd web && npm run typecheck

.PHONY: seed
seed:
	$(GO) run ./cmd/seed

.PHONY: run
run: build
	./$(BIN)

.PHONY: clean
clean:
	@rm -rf bin $(DIST)/assets $(DIST)/index.html
	@echo "已清理 bin/ 与前端产物"
