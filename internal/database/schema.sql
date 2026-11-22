-- goblog 数据库结构。所有时间字段以 RFC3339 UTC 字符串存储，便于字典序比较。
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
	id            INTEGER PRIMARY KEY AUTOINCREMENT,
	username      TEXT NOT NULL UNIQUE,
	password_hash TEXT NOT NULL,
	display_name  TEXT NOT NULL DEFAULT '',
	created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
	id           INTEGER PRIMARY KEY AUTOINCREMENT,
	title        TEXT NOT NULL,
	slug         TEXT NOT NULL UNIQUE,
	summary      TEXT NOT NULL DEFAULT '',
	content_md   TEXT NOT NULL DEFAULT '',
	content_html TEXT NOT NULL DEFAULT '',
	cover        TEXT NOT NULL DEFAULT '',
	category     TEXT NOT NULL DEFAULT '',
	status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
	featured     INTEGER NOT NULL DEFAULT 0,
	views        INTEGER NOT NULL DEFAULT 0,
	reading_time INTEGER NOT NULL DEFAULT 0,
	created_at   TEXT NOT NULL,
	updated_at   TEXT NOT NULL,
	published_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_posts_status_published ON posts (status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts (category);

CREATE TABLE IF NOT EXISTS tags (
	id   INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS post_tags (
	post_id INTEGER NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
	tag_id  INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
	PRIMARY KEY (post_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_post_tags_tag ON post_tags (tag_id);

CREATE TABLE IF NOT EXISTS comments (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	post_id    INTEGER NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
	author     TEXT NOT NULL,
	email      TEXT NOT NULL DEFAULT '',
	website    TEXT NOT NULL DEFAULT '',
	content    TEXT NOT NULL,
	status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'spam')),
	created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_post_status ON comments (post_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_status ON comments (status, created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
	key   TEXT PRIMARY KEY,
	value TEXT NOT NULL
);
