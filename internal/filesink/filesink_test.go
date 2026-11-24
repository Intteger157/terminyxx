package filesink

import (
	"encoding/base64"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"terminyxx/internal/testutil"
)

func TestSafeParts(t *testing.T) {
	good := map[string][]string{
		`docs\images`: {"docs", "images"},
		"a/b/c.txt":   {"a", "b", "c.txt"},
		`.\a`:         {"a"},
		"":            nil,
	}
	for in, want := range good {
		got, err := SafeParts(in)
		if err != nil {
			t.Fatalf("SafeParts(%q): %v", in, err)
		}
		if len(got) != len(want) {
			t.Fatalf("SafeParts(%q) = %q, want %q", in, got, want)
		}
		for i := range got {
			if got[i] != want[i] {
				t.Fatalf("SafeParts(%q) = %q, want %q", in, got, want)
			}
		}
	}
	for _, bad := range []string{`..\x`, "a/../../x", `C:\Windows`, "/etc/passwd", `\\server\share`, "con", "NUL.txt", "a\x00b", "trail.", "trail ", "a?b"} {
		if _, err := SafeParts(bad); err == nil {
			t.Errorf("SafeParts(%q) accepted", bad)
		}
	}
}

func write(t *testing.T, s *Sink, h, data string) {
	t.Helper()
	if err := s.WriteBase64(h, base64.StdEncoding.EncodeToString([]byte(data))); err != nil {
		t.Fatal(err)
	}
}

func TestCreateWriteCommit(t *testing.T) {
	dir := t.TempDir()
	s := New()
	if _, err := s.Create(dir, "a.txt"); !errors.Is(err, ErrNotAllowed) {
		t.Fatalf("Create before Allow: %v", err)
	}
	t.Cleanup(s.AbortAll)
	if err := s.Allow(dir); err != nil {
		t.Fatal(err)
	}

	h, err := s.Create(dir, `sub\a.txt`)
	if err != nil {
		t.Fatal(err)
	}
	write(t, s, h, "hello ")
	write(t, s, h, "world")
	p, err := s.Close(h, true)
	if err != nil {
		t.Fatal(err)
	}
	if p != filepath.Join(dir, "sub", "a.txt") {
		t.Fatalf("path = %s", p)
	}
	if b, _ := os.ReadFile(p); string(b) != "hello world" {
		t.Fatalf("content = %q", b)
	}

	// The same name again gets a number instead of overwriting.
	h, _ = s.Create(dir, `sub\a.txt`)
	write(t, s, h, "second")
	p2, err := s.Close(h, true)
	if err != nil {
		t.Fatal(err)
	}
	if p2 != filepath.Join(dir, "sub", "a (2).txt") {
		t.Fatalf("second path = %s", p2)
	}
	if b, _ := os.ReadFile(p); string(b) != "hello world" {
		t.Fatal("first file was overwritten")
	}

	// An aborted file leaves nothing behind.
	h, _ = s.Create(dir, "gone.bin")
	write(t, s, h, "x")
	if _, err := s.Close(h, false); err != nil {
		t.Fatal(err)
	}
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if e.Name() != "sub" {
			t.Fatalf("leftover %s", e.Name())
		}
	}
}

func TestEscapesRejected(t *testing.T) {
	dir := t.TempDir()
	s := New()
	t.Cleanup(s.AbortAll)
	if err := s.Allow(dir); err != nil {
		t.Fatal(err)
	}
	for _, rel := range []string{`..\evil.txt`, "", `x\..\..\evil`} {
		if _, err := s.Create(dir, rel); err == nil {
			t.Errorf("Create(%q) accepted", rel)
		}
	}
	if err := s.Mkdir(filepath.Join(dir, "other"), "x"); !errors.Is(err, ErrNotAllowed) {
		t.Errorf("Mkdir outside allowed folder: %v", err)
	}
}

func TestFileSinkStaysInsidePickedFolder(t *testing.T) {
	dir, outside := t.TempDir(), t.TempDir()
	testutil.DirectoryLink(t, outside, filepath.Join(dir, "sub"))
	s := New()
	t.Cleanup(s.AbortAll)
	if err := s.Allow(dir); err != nil {
		t.Fatal(err)
	}
	if err := s.Mkdir(dir, "sub/nested"); err == nil {
		t.Fatal("created a folder outside the selected root")
	}
	if _, err := s.Create(dir, "sub/note.txt"); err == nil {
		t.Fatal("created a file outside the selected root")
	}
	if entries, err := os.ReadDir(outside); err != nil || len(entries) != 0 {
		t.Fatalf("outside directory is not empty: %v, %v", entries, err)
	}
}

func TestNumbered(t *testing.T) {
	cases := map[string]string{
		filepath.Join("d", "a.txt"):    filepath.Join("d", "a (3).txt"),
		filepath.Join("d", "noext"):    filepath.Join("d", "noext (3)"),
		filepath.Join("d.x", "noext"):  filepath.Join("d.x", "noext (3)"),
		filepath.Join("d", "a.tar.gz"): filepath.Join("d", "a.tar (3).gz"),
	}
	for in, want := range cases {
		if got := numbered(in, 3); got != want {
			t.Errorf("numbered(%q) = %q, want %q", in, got, want)
		}
	}
}
