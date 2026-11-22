package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"goblog/internal/config"
	"goblog/internal/database"
	"goblog/internal/httpapi"
	"goblog/internal/markdown"
	"goblog/internal/service"
	"goblog/internal/store"
	"goblog/internal/webassets"
)

const version = "0.0.1"

func main() {
	if len(os.Args) == 2 && os.Args[1] == "--version" {
		fmt.Println(version)
		return
	}

	if err := run(); err != nil {
		slog.Error("服务启动失败", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	setupLogger(cfg.Debug)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := database.Open(ctx, cfg.DatabaseDSN)
	if err != nil {
		return err
	}
	defer db.Close()

	repository := store.New(db)
	renderer := markdown.New()

	authService := service.NewAuthService(repository.User, cfg.JWTSecret, cfg.TokenTTL, cfg.AdminUser, cfg.AdminPass)
	if err := authService.EnsureAdmin(ctx); err != nil {
		return err
	}

	settingsService := service.NewSettingsService(repository.Conf)
	postService := service.NewPostService(repository.Post, repository.Tag, renderer)
	commentService := service.NewCommentService(repository.Cmt, repository.Post, settingsService)
	mediaService := service.NewMediaService(cfg.UploadDir)

	api := httpapi.New(httpapi.Dependencies{
		Auth:     authService,
		Posts:    postService,
		Comments: commentService,
		Settings: settingsService,
		Media:    mediaService,
		Assets:   webassets.Handler(),
		AssetFS:  webassets.FS(),
		SiteURL:  cfg.SiteURL,
	})

	server := &http.Server{
		Addr:              cfg.Addr,
		Handler:           api.Handler(cfg.CORSOrigin, cfg.UploadDir),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
		ErrorLog:          slog.NewLogLogger(slog.Default().Handler(), slog.LevelWarn),
	}

	serverErr := make(chan error, 1)
	go func() {
		slog.Info("博客服务已启动", "addr", cfg.Addr, "dataDir", cfg.DataDir)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
		close(serverErr)
	}()

	select {
	case err := <-serverErr:
		return err
	case <-ctx.Done():
		slog.Info("收到退出信号，正在关闭服务")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		return err
	}
	slog.Info("服务已退出")
	return nil
}

func setupLogger(debug bool) {
	level := slog.LevelInfo
	if debug {
		level = slog.LevelDebug
	}
	handler := slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: level})
	slog.SetDefault(slog.New(handler))
}
