package connection

import (
	"io"
	"os"
	"strings"
	"testing"

	"github.com/pkg/sftp"
)

func TestRemoteEdit(t *testing.T) {
	s := newTestServer(t, serverOpts{password: "secret"})
	m, _, _ := newManager(t)
	connectTrusted(t, m, passwordReq(s, "e"))
	b, err := m.sftp("e")
	must(t, err)

	must(t, m.Mkdir("e", "/etc"))
	put := func(name, content string) {
		t.Helper()
		f, err := b.client.Create(name)
		must(t, err)
		f.Write([]byte(content))
		must(t, f.Close())
	}
	put("/etc/app.conf", "порт=80\n")

	file, err := m.ReadForEdit("e", "/etc/app.conf")
	must(t, err)
	if file.Content != "порт=80\n" || file.Version == "" {
		t.Fatalf("%+v", file)
	}

	v2, err := m.WriteEdited("e", "/etc/app.conf", "порт=8080\n", file.Version, false)
	must(t, err)
	if v2 == file.Version {
		t.Error("version did not change after save")
	}
	got, _ := m.ReadForEdit("e", "/etc/app.conf")
	if got.Content != "порт=8080\n" || got.Version != v2 {
		t.Fatalf("after save: %+v (want version %s)", got, v2)
	}
	entries, _ := m.ListDir("e", "/etc")
	if len(entries) != 1 {
		t.Fatalf("temporary file left behind: %+v", entries)
	}

	// Someone else edits the file: saving with the old version is refused.
	put("/etc/app.conf", "changed elsewhere, longer content\n")
	_, err = m.WriteEdited("e", "/etc/app.conf", "mine\n", v2, false)
	if err == nil || !strings.HasPrefix(err.Error(), EditConflictPrefix) {
		t.Fatalf("conflict not detected: %v", err)
	}
	if cur, _ := m.ReadForEdit("e", "/etc/app.conf"); !strings.HasPrefix(cur.Content, "changed elsewhere") {
		t.Fatal("a refused save modified the file")
	}
	// ...unless the user chooses to overwrite.
	if _, err := m.WriteEdited("e", "/etc/app.conf", "mine\n", v2, true); err != nil {
		t.Fatal(err)
	}
	if cur, _ := m.ReadForEdit("e", "/etc/app.conf"); cur.Content != "mine\n" {
		t.Fatalf("forced save: %q", cur.Content)
	}
}

func TestRemoteEditRefusals(t *testing.T) {
	s := newTestServer(t, serverOpts{password: "secret"})
	m, _, _ := newManager(t)
	connectTrusted(t, m, passwordReq(s, "e"))
	b, _ := m.sftp("e")
	put := func(name string, data []byte) {
		f, err := b.client.Create(name)
		must(t, err)
		f.Write(data)
		must(t, f.Close())
	}
	put("/bin.dat", []byte{1, 2, 0, 3})
	put("/latin1.txt", []byte{'c', 'a', 'f', 0xE9})
	put("/big.txt", make([]byte, maxEditBytes+10))
	for _, name := range []string{"/bin.dat", "/latin1.txt"} {
		if _, err := m.ReadForEdit("e", name); err != ErrNotText {
			t.Errorf("%s: %v", name, err)
		}
	}
	if _, err := m.ReadForEdit("e", "/big.txt"); err == nil || !strings.Contains(err.Error(), "larger") {
		t.Errorf("big file: %v", err)
	}
	if _, err := m.ReadForEdit("e", "/missing"); err == nil {
		t.Error("missing file accepted")
	}
}

type readOnlyDirectoryWriter struct{ sftp.FileWriter }

func (w readOnlyDirectoryWriter) Filewrite(req *sftp.Request) (io.WriterAt, error) {
	if req.Filepath != "/document.txt" {
		return nil, os.ErrPermission
	}
	return w.FileWriter.Filewrite(req)
}

func TestRemoteEditPreservesOriginalIfStagingIsDenied(t *testing.T) {
	s := newTestServer(t, serverOpts{password: "secret", wrapWriter: func(w sftp.FileWriter) sftp.FileWriter {
		return readOnlyDirectoryWriter{w}
	}})
	m, _, _ := newManager(t)
	connectTrusted(t, m, passwordReq(s, "edit"))
	b, err := m.sftp("edit")
	must(t, err)
	f, err := b.client.Create("/document.txt")
	must(t, err)
	_, err = f.Write([]byte("original"))
	must(t, err)
	must(t, f.Close())
	file, err := b.ReadForEdit("/document.txt")
	must(t, err)
	if _, err := b.WriteEdited("/document.txt", "revision", file.Version, false); err == nil {
		t.Fatal("save succeeded without a staged file")
	}
	got, err := b.ReadForEdit("/document.txt")
	must(t, err)
	if got.Content != file.Content {
		t.Fatalf("original was modified: %q", got.Content)
	}
}
