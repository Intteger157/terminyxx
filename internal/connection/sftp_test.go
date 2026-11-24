package connection

import (
	"bytes"
	"context"
	"crypto/rand"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"terminyxx/internal/testutil"
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

func TestDownloadStaysInsideSelectedDirectory(t *testing.T) {
	dest, outside := t.TempDir(), t.TempDir()
	testutil.DirectoryLink(t, outside, filepath.Join(dest, "sub"))
	s := newTestServer(t, serverOpts{password: "secret"})
	m, _, _ := newManager(t)
	connectTrusted(t, m, passwordReq(s, "root"))
	b, err := m.sftp("root")
	must(t, err)
	must(t, b.Mkdir("/sub"))
	f, err := b.client.Create("/sub/note.txt")
	must(t, err)
	_, err = f.Write([]byte("note"))
	must(t, err)
	must(t, f.Close())
	if err := m.Transfer("root", TransferRequest{JobID: "root", Direction: "download", DestDir: dest, Sources: []string{"/sub"}}); err == nil {
		t.Fatal("download followed a directory outside the selected root")
	}
	entries, err := os.ReadDir(outside)
	must(t, err)
	if len(entries) != 0 {
		t.Fatal("download created a file outside the selected root")
	}
}

type transferProgressHook func(TransferProgress)

func (hook transferProgressHook) Emit(_ string, data ...interface{}) {
	hook(data[0].(TransferProgress))
}

func TestTransferReplacementPreservesDestinationUntilComplete(t *testing.T) {
	s := newTestServer(t, serverOpts{password: "secret"})
	m, _, _ := newManager(t)
	connectTrusted(t, m, passwordReq(s, "replace"))
	bridge, err := m.sftp("replace")
	must(t, err)
	must(t, m.Mkdir("replace", "/remote"))
	sourceDir, destDir := t.TempDir(), t.TempDir()
	source := filepath.Join(sourceDir, "file.txt")
	dest := filepath.Join(destDir, "file.txt")
	const remote = "/remote/file.txt"
	old := []byte("existing data")
	content := bytes.Repeat([]byte("new content\n"), 1<<16)
	must(t, os.WriteFile(source, old, 0o644))
	must(t, os.WriteFile(dest, old, 0o644))
	must(t, m.Transfer("replace", TransferRequest{JobID: "seed", Direction: "upload", Sources: []string{source}, DestDir: "/remote"}))
	must(t, os.WriteFile(source, content, 0o644))

	cancelAfterFirstBytes := func(copyFile func(context.Context, transferItem, *progressTracker) error, item transferItem) {
		t.Helper()
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		tracker := &progressTracker{emitter: transferProgressHook(func(p TransferProgress) {
			if p.BytesDone > 0 {
				cancel()
			}
		})}
		if err := copyFile(ctx, item, tracker); !errors.Is(err, context.Canceled) {
			t.Fatalf("partially written transfer returned %v", err)
		}
	}

	up := TransferRequest{JobID: "upload", Direction: "upload", Sources: []string{source}, DestDir: "/remote"}
	uploadItems, err := bridge.planUpload(up)
	must(t, err)
	cancelAfterFirstBytes(bridge.uploadFile, uploadItems[0])
	if got, err := m.ReadRemoteFile("replace", remote); err != nil || got != string(old) {
		t.Fatalf("cancelled upload did not preserve the destination: %q, %v", got, err)
	}
	entries, err := m.ListDir("replace", "/remote")
	must(t, err)
	if len(entries) != 1 || entries[0].Name != "file.txt" {
		t.Fatalf("cancelled upload left temporary data: %+v", entries)
	}
	must(t, m.Transfer("replace", up))

	down := TransferRequest{JobID: "download", Direction: "download", Sources: []string{remote}, DestDir: destDir}
	downloadItems, err := bridge.planDownload(down)
	must(t, err)
	root, err := os.OpenRoot(destDir)
	must(t, err)
	defer root.Close()
	cancelAfterFirstBytes(func(ctx context.Context, item transferItem, tracker *progressTracker) error {
		return bridge.downloadFile(ctx, root, item, tracker)
	}, downloadItems[0])
	got, err := os.ReadFile(dest)
	must(t, err)
	if !bytes.Equal(got, old) {
		t.Fatal("cancelled download did not preserve the destination")
	}
	localEntries, err := os.ReadDir(destDir)
	must(t, err)
	if len(localEntries) != 1 || localEntries[0].Name() != "file.txt" {
		t.Fatalf("cancelled download left temporary data: %+v", localEntries)
	}
	must(t, m.Transfer("replace", down))
	got, err = os.ReadFile(dest)
	must(t, err)
	if !bytes.Equal(got, content) {
		t.Fatal("successful replacement has the wrong contents")
	}

	// Losing the connection is a different error path from cancelling a job.
	// Reconnect to the same server and check the destination on disk there.
	var drop sync.Once
	tracker := &progressTracker{emitter: transferProgressHook(func(p TransferProgress) {
		if p.BytesDone > 0 {
			drop.Do(func() { _ = bridge.Close() })
		}
	})}
	must(t, os.WriteFile(source, bytes.Repeat([]byte("interrupted\n"), 1<<16), 0o644))
	uploadItems, err = bridge.planUpload(up)
	must(t, err)
	if err := bridge.uploadFile(context.Background(), uploadItems[0], tracker); err == nil {
		t.Fatal("upload succeeded after losing its SFTP channel")
	}
	must(t, m.Disconnect("replace"))
	must(t, m.Connect(passwordReq(s, "replace")))
	must(t, m.Transfer("replace", down))
	got, err = os.ReadFile(dest)
	must(t, err)
	if !bytes.Equal(got, content) {
		t.Fatal("interrupted upload changed the remote destination")
	}
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
