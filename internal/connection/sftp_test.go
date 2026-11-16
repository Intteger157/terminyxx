package connection

import (
	"bytes"
	"crypto/rand"
	"os"
	"path/filepath"
	"testing"
)

func TestSFTPRoundTrip(t *testing.T) {
	s := newTestServer(t, serverOpts{password: "secret"})
	m, rec, _ := newManager(t)
	connectTrusted(t, m, passwordReq(s, "f"))

	// Local tree: proj/a.txt, proj/sub/big.bin (2 MB), proj/sub/ru.txt
	local := t.TempDir()
	proj := filepath.Join(local, "proj")
	must(t, os.MkdirAll(filepath.Join(proj, "sub"), 0o755))
	must(t, os.WriteFile(filepath.Join(proj, "a.txt"), []byte("hello"), 0o644))
	big := make([]byte, 2<<20)
	rand.Read(big)
	must(t, os.WriteFile(filepath.Join(proj, "sub", "big.bin"), big, 0o644))
	must(t, os.WriteFile(filepath.Join(proj, "sub", "ru.txt"), []byte("Привет"), 0o644))

	must(t, m.Mkdir("f", "/remote"))
	must(t, m.Transfer("f", TransferRequest{JobID: "up", Direction: "upload", Sources: []string{proj}, DestDir: "/remote"}))

	entries, err := m.ListDir("f", "/remote/proj")
	must(t, err)
	if len(entries) != 2 || !entries[0].IsDir || entries[0].Name != "sub" || entries[1].Name != "a.txt" {
		t.Fatalf("unexpected listing (dirs first): %+v", entries)
	}

	text, err := m.ReadRemoteFile("f", "/remote/proj/sub/ru.txt")
	must(t, err)
	if text != "Привет" {
		t.Fatalf("preview = %q", text)
	}
	if _, err := m.ReadRemoteFile("f", "/remote/proj/sub/big.bin"); err != ErrBinaryFile {
		t.Fatalf("binary preview should fail, got %v", err)
	}

	// Final progress event reports everything done.
	var last TransferProgress
	rec.mu.Lock()
	for _, e := range rec.events {
		if e.name == "sftp:progress:f" {
			last = e.data[0].(TransferProgress)
		}
	}
	rec.mu.Unlock()
	if !last.Done || last.Error != "" || last.FilesDone != 3 || last.BytesDone != last.BytesTotal || last.BytesTotal != int64(len(big)+5+len("Привет")) {
		t.Fatalf("bad final progress: %+v", last)
	}

	// Download back and compare.
	back := t.TempDir()
	must(t, m.Transfer("f", TransferRequest{JobID: "down", Direction: "download", Sources: []string{"/remote/proj"}, DestDir: back}))
	got, err := os.ReadFile(filepath.Join(back, "proj", "sub", "big.bin"))
	must(t, err)
	if !bytes.Equal(got, big) {
		t.Fatal("downloaded file differs")
	}

	// Rename, move (download+delete), recursive remove.
	must(t, m.Rename("f", "/remote/proj/a.txt", "/remote/proj/b.txt"))
	moved := t.TempDir()
	must(t, m.Transfer("f", TransferRequest{JobID: "mv", Direction: "download", Sources: []string{"/remote/proj/b.txt"}, DestDir: moved, Move: true}))
	if _, err := os.Stat(filepath.Join(moved, "b.txt")); err != nil {
		t.Fatal("moved file missing locally")
	}
	if _, err := m.ReadRemoteFile("f", "/remote/proj/b.txt"); err == nil {
		t.Fatal("moved file still on server")
	}
	must(t, m.Remove("f", "/remote/proj"))
	if entries, _ := m.ListDir("f", "/remote"); len(entries) != 0 {
		t.Fatalf("recursive remove left %+v", entries)
	}
}

func TestTransferCancel(t *testing.T) {
	s := newTestServer(t, serverOpts{password: "secret"})
	m, _, _ := newManager(t)
	connectTrusted(t, m, passwordReq(s, "c"))

	src := filepath.Join(t.TempDir(), "x.bin")
	must(t, os.WriteFile(src, make([]byte, 1<<20), 0o644))
	m.CancelTransfer("nothing") // unknown job: no-op

	// Cancel before the job starts reading: the context is checked per read.
	done := make(chan error, 1)
	go func() {
		done <- m.Transfer("c", TransferRequest{JobID: "j", Direction: "upload", Sources: []string{src}, DestDir: "/"})
	}()
	m.CancelTransfer("j")
	<-done // must return either way (cancelled or already finished)
}

func TestLocalParentDir(t *testing.T) {
	dir := t.TempDir()
	if got := LocalParentDir(filepath.Join(dir, "x")); got != dir {
		t.Fatalf("parent = %q, want %q", got, dir)
	}
	if LocalParentDir("") != "" {
		t.Fatal("empty path parent should be empty")
	}
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
