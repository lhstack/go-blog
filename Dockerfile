> 两阶段构建：Node 构建前端，Go 编译并嵌入产物，最终镜像只保留二进制。

# ---------- 前端构建 ----------
FROM node:22-alpine AS web
WORKDIR /app/web

# 国内构建时可通过 --build-arg NPM_REGISTRY=... 指定镜像源
ARG NPM_REGISTRY=https://registry.npmmirror.com
RUN npm config set registry $NPM_REGISTRY

COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY web/ ./
# vite 的输出目录是 ../internal/webassets/dist，这里先建好目标目录
RUN mkdir -p /app/internal/webassets/dist && npm run build

# ---------- 后端构建 ----------
FROM golang:1.24-alpine AS server
WORKDIR /app

ARG GOPROXY=https://goproxy.cn,direct
ENV GOPROXY=$GOPROXY \
    CGO_ENABLED=0 \
    GOTOOLCHAIN=local

COPY go.mod go.sum ./
RUN go mod download

COPY cmd/ ./cmd/
COPY internal/ ./internal/
# 用上一步的真实前端产物覆盖仓库里的占位文件
COPY --from=web /app/internal/webassets/dist/ ./internal/webassets/dist/

RUN go build -trimpath -ldflags="-s -w" -o /out/goblog ./cmd/server

# ---------- 运行镜像 ----------
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata \
    && adduser -D -u 10001 goblog \
    && mkdir -p /data/uploads \
    && chown -R goblog:goblog /data

WORKDIR /app
COPY --from=server /out/goblog /app/goblog

ENV GOBLOG_ADDR=:8080 \
    GOBLOG_DATA_DIR=/data \
    TZ=Asia/Shanghai

USER goblog
VOLUME ["/data"]
EXPOSE 8080

ENTRYPOINT ["/app/goblog"]
