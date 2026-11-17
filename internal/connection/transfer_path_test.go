package connection

import (
	"path/filepath"
	"runtime"
	"testing"
)

func TestDownloadTargetRejectsTraversal(t *testing.T) {
	root := filepath.Join(t.TempDir(), "dl")
	ok := map[[2]string]string{
		{"/srv/data", "/srv/data"}:         root,
		{"/srv/data", "/srv/data/a/b.txt"}: filepath.Join(root, "a", "b.txt"),
		{"/", "/etc/hosts"}:                filepath.Join(root, "etc", "hosts"),
	}
	for in, want := range ok {
		got, err := downloadTarget(root, in[0], in[1])
		if err != nil || got != want {
			t.Errorf("downloadTarget(%q, %q) = %q, %v; want %q", in[0], in[1], got, err, want)
		}
	}
	bad := [][2]string{
		{"/srv/data", "/srv/other"},   // outside src (a "../other" name, cleaned by path.Join)
		{"/srv/data", "/srv/data2/x"}, // sibling with the same prefix
		{"/srv/data", "/srv"},         // shorter than src: used to panic
		{"/srv/data", "/srv/data/.."},
	}
	if runtime.GOOS == "windows" {
		bad = append(bad, [2]string{"/srv/data", `/srv/data/..\..\evil.txt`})
	}
	for _, in := range bad {
		if got, err := downloadTarget(root, in[0], in[1]); err == nil {
			t.Errorf("downloadTarget(%q, %q) = %q; want an error", in[0], in[1], got)
		}
	}
}
