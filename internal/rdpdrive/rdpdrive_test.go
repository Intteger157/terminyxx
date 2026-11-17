package rdpdrive

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"testing"
)

const dev = FirstDeviceID

func newSession(t *testing.T, readOnly bool) (*Session, string) {
	t.Helper()
	dir := t.TempDir()
	s, failed := NewSession([]Drive{{ID: dev, Name: "Test", Path: dir, ReadOnly: readOnly}})
	if len(failed) > 0 {
		t.Fatal("drive not opened")
	}
	t.Cleanup(s.Close)
	return s, dir
}

func create(t *testing.T, s *Session, path string, disposition, options, access uint32) Reply {
	t.Helper()
	return s.Do(Request{Op: "create", DeviceID: dev, Path: path, Disposition: disposition, Options: options, DesiredAccess: access})
}

func do(s *Session, op string, fileID uint32, req Request) Reply {
	req.Op, req.DeviceID, req.FileID = op, dev, fileID
	return s.Do(req)
}

const rw = accessWriteData | 0x1 | accessDelete

func TestCreateWriteReadClose(t *testing.T) {
	s, dir := newSession(t, false)
	r := create(t, s, `\docs`, fileCreate, optDirectoryFile, rw)
	if r.Status != StatusSuccess || r.Information != infoCreated {
		t.Fatalf("mkdir: %+v", r)
	}
	do(s, "close", r.FileID, Request{})

	r = create(t, s, `\docs\a.txt`, fileOverwriteIf, optNonDirectoryFile, rw)
	if r.Status != StatusSuccess || r.Information != infoCreated {
		t.Fatalf("create: %+v", r)
	}
	id := r.FileID
	if w := do(s, "write", id, Request{Offset: 0, Data: []byte("hello world")}); w.Status != StatusSuccess || w.Length != 11 {
		t.Fatalf("write: %+v", w)
	}
	if rd := do(s, "read", id, Request{Offset: 6, Length: 100}); rd.Status != StatusSuccess || string(rd.Data) != "world" {
		t.Fatalf("read: %+v %q", rd, rd.Data)
	}
	if rd := do(s, "read", id, Request{Offset: 100, Length: 10}); rd.Status != StatusSuccess || len(rd.Data) != 0 {
		t.Fatalf("read past the end: %+v", rd)
	}
	st := do(s, "stat", id, Request{})
	if st.Status != StatusSuccess || st.Stat.Size != 11 || st.Stat.Dir || st.Stat.Written == 0 {
		t.Fatalf("stat: %+v", st.Stat)
	}
	if r := do(s, "setSize", id, Request{Size: 5}); r.Status != StatusSuccess {
		t.Fatalf("setSize: %+v", r)
	}
	do(s, "close", id, Request{})
	if b, _ := os.ReadFile(filepath.Join(dir, "docs", "a.txt")); string(b) != "hello" {
		t.Fatalf("file = %q", b)
	}
	if r := do(s, "read", id, Request{Length: 1}); r.Status != StatusInvalidHandle {
		t.Fatalf("closed handle: %+v", r)
	}
}

func TestDispositions(t *testing.T) {
	s, dir := newSession(t, false)
	os.WriteFile(filepath.Join(dir, "f.txt"), []byte("data"), 0o644)
	os.Mkdir(filepath.Join(dir, "sub"), 0o755)
	cases := []struct {
		path        string
		disposition uint32
		options     uint32
		status      uint32
		info        uint32
	}{
		{`\f.txt`, fileOpen, 0, StatusSuccess, infoOpened},
		{`\f.txt`, fileCreate, 0, StatusObjectNameCollision, 0},
		{`\nope.txt`, fileOpen, 0, StatusNoSuchFile, 0},
		{`\nodir\x.txt`, fileOpen, 0, StatusObjectPathNotFound, 0},
		{`\nodir\x.txt`, fileCreate, 0, StatusObjectPathNotFound, 0},
		{`\sub`, fileOpen, optNonDirectoryFile, StatusFileIsADirectory, 0},
		{`\f.txt`, fileOpen, optDirectoryFile, StatusNotADirectory, 0},
		{`\new.txt`, fileOpenIf, 0, StatusSuccess, infoCreated},
		{`\f.txt`, fileOverwrite, 0, StatusSuccess, infoOverwritten},
		{`\`, fileOpen, optDirectoryFile, StatusSuccess, infoOpened},
	}
	for _, c := range cases {
		r := create(t, s, c.path, c.disposition, c.options, rw)
		if r.Status != c.status || (c.status == StatusSuccess && r.Information != c.info) {
			t.Errorf("%s disp %d: status %#x info %d, want %#x %d", c.path, c.disposition, r.Status, r.Information, c.status, c.info)
		}
		if r.Status == StatusSuccess {
			do(s, "close", r.FileID, Request{})
		}
	}
	if fi, _ := os.Stat(filepath.Join(dir, "f.txt")); fi.Size() != 0 {
		t.Error("overwrite did not truncate")
	}
}

func TestPathsStayInsideTheDrive(t *testing.T) {
	s, dir := newSession(t, false)
	outside := filepath.Join(filepath.Dir(dir), "outside-"+filepath.Base(dir))
	os.Mkdir(outside, 0o755)
	t.Cleanup(func() { os.RemoveAll(outside) })
	os.WriteFile(filepath.Join(outside, "secret.txt"), []byte("x"), 0o644)

	for _, p := range []string{`\..\` + filepath.Base(outside) + `\secret.txt`, `\a\..\..\x`, `\C:\Windows`, `\f.txt:stream`, `\a/../../x`} {
		if r := create(t, s, p, fileOpenIf, 0, rw); r.Status == StatusSuccess {
			t.Errorf("%q was opened", p)
		}
	}
	// A link pointing outside the drive is not followed.
	if err := os.Symlink(outside, filepath.Join(dir, "link")); err != nil {
		// Windows needs a privilege for symbolic links but not for junctions.
		if runtime.GOOS != "windows" {
			t.Fatal(err)
		}
		if out, err := exec.Command("cmd", "/c", "mklink", "/J", filepath.Join(dir, "link"), outside).CombinedOutput(); err != nil {
			t.Skipf("no link: %v %s", err, out)
		}
	}
	if r := create(t, s, `\link\secret.txt`, fileOpen, 0, 0x1); r.Status == StatusSuccess {
		t.Error("followed a link outside the drive")
	}
	root := create(t, s, `\`, fileOpen, optDirectoryFile, 0x1)
	l := do(s, "list", root.FileID, Request{Path: `\*`})
	for _, e := range l.Entries {
		if e.Name == "link" {
			t.Error("listed a link outside the drive")
		}
	}
}

func TestList(t *testing.T) {
	s, dir := newSession(t, false)
	os.Mkdir(filepath.Join(dir, "sub"), 0o755)
	for _, n := range []string{"a.txt", "B.TXT", "c.doc"} {
		os.WriteFile(filepath.Join(dir, "sub", n), []byte("12345"), 0o644)
	}
	h := create(t, s, `\sub`, fileOpen, optDirectoryFile, 0x1)
	names := func(r Reply) []string {
		var out []string
		for _, e := range r.Entries {
			out = append(out, e.Name)
		}
		sort.Strings(out)
		return out
	}
	all := do(s, "list", h.FileID, Request{Path: `\sub\*`})
	if got := names(all); len(got) != 5 || got[0] != "." || got[1] != ".." {
		t.Fatalf("list = %v", got)
	}
	for _, e := range all.Entries {
		if e.Name == "a.txt" && (e.Size != 5 || e.Dir) {
			t.Errorf("a.txt = %+v", e)
		}
		if e.Name == "." && !e.Dir {
			t.Error(". is not a directory")
		}
	}
	if got := names(do(s, "list", h.FileID, Request{Path: `\sub\*.TXT`})); len(got) != 2 {
		t.Errorf("*.TXT = %v", got)
	}
	if got := names(do(s, "list", h.FileID, Request{Path: `\sub\b.txt`})); len(got) != 1 || got[0] != "b.txt" {
		t.Errorf("exact name = %v", got)
	}
	if r := do(s, "list", h.FileID, Request{Path: `\sub\zzz`}); r.Status != StatusSuccess || len(r.Entries) != 0 {
		t.Errorf("no match = %+v", r)
	}
	root := create(t, s, `\`, fileOpen, optDirectoryFile, 0x1)
	if got := names(do(s, "list", root.FileID, Request{Path: `\*`})); len(got) != 1 || got[0] != "sub" {
		t.Errorf("root list = %v (no dots at the root)", got)
	}
	vol := do(s, "volume", root.FileID, Request{})
	if vol.Status != StatusSuccess || vol.Total <= 0 || vol.Free > vol.Total {
		t.Errorf("volume = %+v", vol)
	}
}

func TestRenameAndDelete(t *testing.T) {
	s, dir := newSession(t, false)
	os.WriteFile(filepath.Join(dir, "a.txt"), []byte("a"), 0o644)
	os.WriteFile(filepath.Join(dir, "b.txt"), []byte("b"), 0o644)

	h := create(t, s, `\a.txt`, fileOpen, 0, rw)
	do(s, "read", h.FileID, Request{Length: 1}) // the OS file is open
	if r := do(s, "rename", h.FileID, Request{To: `\b.txt`}); r.Status != StatusObjectNameCollision {
		t.Fatalf("rename onto b.txt: %#x", r.Status)
	}
	if r := do(s, "rename", h.FileID, Request{To: `\c.txt`}); r.Status != StatusSuccess {
		t.Fatalf("rename: %#x", r.Status)
	}
	if rd := do(s, "read", h.FileID, Request{Length: 1}); string(rd.Data) != "a" {
		t.Fatalf("read after rename: %+v", rd)
	}
	if r := do(s, "setDelete", h.FileID, Request{Delete: true}); r.Status != StatusSuccess {
		t.Fatalf("setDelete: %#x", r.Status)
	}
	do(s, "close", h.FileID, Request{})
	if _, err := os.Stat(filepath.Join(dir, "c.txt")); !os.IsNotExist(err) {
		t.Fatal("c.txt was not deleted on close")
	}

	os.MkdirAll(filepath.Join(dir, "full", "x"), 0o755)
	d := create(t, s, `\full`, fileOpen, optDirectoryFile, rw)
	if r := do(s, "setDelete", d.FileID, Request{Delete: true}); r.Status != StatusDirectoryNotEmpty {
		t.Fatalf("delete non-empty dir: %#x", r.Status)
	}
	noDelete := create(t, s, `\b.txt`, fileOpen, 0, 0x1)
	if r := do(s, "setDelete", noDelete.FileID, Request{Delete: true}); r.Status != StatusAccessDenied {
		t.Fatalf("delete without DELETE access: %#x", r.Status)
	}
}

func TestReadOnlyDrive(t *testing.T) {
	s, dir := newSession(t, true)
	os.WriteFile(filepath.Join(dir, "a.txt"), []byte("abc"), 0o644)
	if r := create(t, s, `\new.txt`, fileCreate, 0, rw); r.Status != StatusMediaWriteProtected {
		t.Errorf("create: %#x", r.Status)
	}
	if r := create(t, s, `\a.txt`, fileOpen, 0, accessWriteData); r.Status != StatusMediaWriteProtected {
		t.Errorf("open for writing: %#x", r.Status)
	}
	h := create(t, s, `\a.txt`, fileOpen, 0, 0x1|accessMaximumAllowed)
	if h.Status != StatusSuccess {
		t.Fatalf("open: %#x", h.Status)
	}
	if r := do(s, "write", h.FileID, Request{Data: []byte("x")}); r.Status != StatusMediaWriteProtected {
		t.Errorf("write: %#x", r.Status)
	}
	if r := do(s, "read", h.FileID, Request{Length: 3}); string(r.Data) != "abc" {
		t.Errorf("read: %+v", r)
	}
}

func TestMatch(t *testing.T) {
	cases := []struct {
		pattern, name string
		want          bool
	}{
		{"*", "anything", true},
		{"*.*", "noext", true},
		{"*.txt", "A.TXT", true},
		{"*.txt", "a.txt.bak", false},
		{"a?c", "abc", true},
		{"a?c", "ac", false},
		{"<.txt", "x.txt", true},
		{"Привет*", "привет мир", true},
	}
	for _, c := range cases {
		if got := match(c.pattern, c.name); got != c.want {
			t.Errorf("match(%q, %q) = %v", c.pattern, c.name, got)
		}
	}
}

func TestPlanNamesAreUnique(t *testing.T) {
	a, b := t.TempDir(), t.TempDir()
	os.Mkdir(filepath.Join(a, "Work"), 0o755)
	os.Mkdir(filepath.Join(b, "Work"), 0o755)
	drives := Plan([]string{filepath.Join(a, "Work"), filepath.Join(b, "Work"), filepath.Join(a, "Work")}, false, true)
	if len(drives) != 2 || drives[0].Name != "Work" || drives[1].Name != "Work (2)" {
		t.Fatalf("plan = %+v", drives)
	}
	if drives[0].ID != FirstDeviceID || drives[1].ID != FirstDeviceID+1 || !drives[0].ReadOnly {
		t.Fatalf("plan = %+v", drives)
	}
}

func TestStatNameDeepPaths(t *testing.T) {
	s, dir := newSession(t, false)
	deep := dir
	rel := ""
	for i := 0; i < 12; i++ {
		part := "folder-with-a-long-name-" + string(rune('a'+i))
		deep = filepath.Join(deep, part)
		rel += `\` + part
	}
	if err := os.MkdirAll(deep, 0o755); err != nil {
		t.Skip(err)
	}
	if err := os.WriteFile(filepath.Join(deep, "f.txt"), []byte("12345"), 0o644); err != nil {
		t.Skip(err)
	}
	r := create(t, s, rel+`\f.txt`, fileOpen, 0, 0x80)
	if r.Status != StatusSuccess || r.Stat == nil || r.Stat.Size != 5 {
		t.Fatalf("deep stat: %+v", r)
	}
	if r := create(t, s, rel+`\missing.txt`, fileOpen, 0, 0x80); r.Status != StatusNoSuchFile {
		t.Fatalf("missing: %#x", r.Status)
	}
}
