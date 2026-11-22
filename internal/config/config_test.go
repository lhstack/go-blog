package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveDataDir(t *testing.T) {
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	executable, err = filepath.EvalSymlinks(executable)
	if err != nil {
		t.Fatal(err)
	}

	// 切到不同的工作目录，确保相对路径仍然以可执行文件为基准。
	t.Chdir(t.TempDir())
	absolute := filepath.Join(t.TempDir(), "data")
	tests := []struct {
		name string
		path string
		want string
	}{
		{"默认相对路径", "./data", filepath.Join(filepath.Dir(executable), "data")},
		{"自定义相对路径", filepath.Join("state", "blog"), filepath.Join(filepath.Dir(executable), "state", "blog")},
		{"绝对路径", absolute, absolute},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := resolveDataDir(tt.path)
			if err != nil {
				t.Fatal(err)
			}
			if got != tt.want {
				t.Errorf("resolveDataDir(%q) = %q, want %q", tt.path, got, tt.want)
			}
		})
	}
}
