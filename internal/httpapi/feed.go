package httpapi

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"net/http"
	"time"

	"goblog/internal/model"
	"goblog/internal/store"
)

// feed 是 RSS 2.0 文档结构。
type feed struct {
	XMLName xml.Name    `xml:"rss"`
	Version string      `xml:"version,attr"`
	Channel feedChannel `xml:"channel"`
}

type feedChannel struct {
	Title       string     `xml:"title"`
	Link        string     `xml:"link"`
	Description string     `xml:"description"`
	Language    string     `xml:"language"`
	LastBuild   string     `xml:"lastBuildDate"`
	Items       []feedItem `xml:"item"`
}

type feedItem struct {
	Title       string `xml:"title"`
	Link        string `xml:"link"`
	GUID        string `xml:"guid"`
	Description string `xml:"description"`
	Category    string `xml:"category,omitempty"`
	PubDate     string `xml:"pubDate"`
}

// handleRSS 输出已发布文章的 RSS 2.0 订阅源。
func (s *Server) handleRSS(w http.ResponseWriter, r *http.Request) {
	settings, err := s.settings.Get(r.Context())
	if err != nil {
		writeServiceError(w, err)
		return
	}
	posts, err := s.posts.PublicList(r.Context(), store.PostFilter{Page: 1, PageSize: 30})
	if err != nil {
		writeServiceError(w, err)
		return
	}

	base := s.siteBaseURL(r, settings)
	items := make([]feedItem, 0, len(posts.Items))
	for _, post := range posts.Items {
		link := base + "/posts/" + post.Slug
		pubDate := post.UpdatedAt
		if post.PublishedAt != nil {
			pubDate = *post.PublishedAt
		}
		items = append(items, feedItem{
			Title:       post.Title,
			Link:        link,
			GUID:        link,
			Description: post.Summary,
			Category:    post.Category,
			PubDate:     pubDate.Format(time.RFC1123Z),
		})
	}

	doc := feed{
		Version: "2.0",
		Channel: feedChannel{
			Title:       settings.Title,
			Link:        base + "/",
			Description: settings.Description,
			Language:    "zh-CN",
			LastBuild:   time.Now().UTC().Format(time.RFC1123Z),
			Items:       items,
		},
	}

	var buf bytes.Buffer
	buf.WriteString(xml.Header)
	encoder := xml.NewEncoder(&buf)
	encoder.Indent("", "  ")
	if err := encoder.Encode(doc); err != nil {
		writeServiceError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/rss+xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=600")
	w.WriteHeader(http.StatusOK)
	if _, err := w.Write(buf.Bytes()); err != nil {
		return
	}
}

type urlSet struct {
	XMLName xml.Name   `xml:"urlset"`
	Xmlns   string     `xml:"xmlns,attr"`
	URLs    []urlEntry `xml:"url"`
}

type urlEntry struct {
	Loc     string `xml:"loc"`
	LastMod string `xml:"lastmod,omitempty"`
}

// handleSitemap 输出已发布文章与主要页面的站点地图。
func (s *Server) handleSitemap(w http.ResponseWriter, r *http.Request) {
	settings, err := s.settings.Get(r.Context())
	if err != nil {
		writeServiceError(w, err)
		return
	}
	posts, err := s.posts.PublicList(r.Context(), store.PostFilter{Page: 1, PageSize: 60})
	if err != nil {
		writeServiceError(w, err)
		return
	}

	base := s.siteBaseURL(r, settings)
	entries := []urlEntry{
		{Loc: base + "/"},
		{Loc: base + "/archive"},
		{Loc: base + "/about"},
	}
	for _, post := range posts.Items {
		entry := urlEntry{Loc: base + "/posts/" + post.Slug, LastMod: post.UpdatedAt.Format("2006-01-02")}
		entries = append(entries, entry)
	}

	doc := urlSet{Xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9", URLs: entries}
	var buf bytes.Buffer
	buf.WriteString(xml.Header)
	encoder := xml.NewEncoder(&buf)
	encoder.Indent("", "  ")
	if err := encoder.Encode(doc); err != nil {
		writeServiceError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.WriteHeader(http.StatusOK)
	if _, err := w.Write(buf.Bytes()); err != nil {
		return
	}
}

// siteBaseURL 优先使用配置的站点地址，否则按请求推断。
func (s *Server) siteBaseURL(r *http.Request, settings *model.Settings) string {
	if configured := s.siteURL; configured != "" {
		return configured
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if proto := r.Header.Get("X-Forwarded-Proto"); proto == "https" {
		scheme = "https"
	}
	host := r.Host
	if forwarded := r.Header.Get("X-Forwarded-Host"); forwarded != "" {
		host = forwarded
	}
	return fmt.Sprintf("%s://%s", scheme, host)
}
