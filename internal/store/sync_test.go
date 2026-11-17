package store

import (
	"path/filepath"
	"testing"

	"terminyxx/internal/rdp"
)

func TestBundleRoundTrip(t *testing.T) {
	open := func() *Store {
		s, err := Open(filepath.Join(t.TempDir(), "t.db"), NewMemorySecrets())
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { s.Close() })
		return s
	}
	a, b := open(), open()
	must(t, a.SaveFolder(Folder{ID: "root", Name: "root"}))
	must(t, a.SaveFolder(Folder{ID: "child", Name: "child", ParentID: "root"}))
	must(t, a.SaveSSHProfile(SSHProfile{ID: "h", Name: "h", Host: "x", Username: "u", FolderID: "child", Password: "pw"}))
	must(t, a.SaveRDPProfile(rdp.RDPProfile{ID: "r", Name: "r", Host: "y", Password: "rpw", Options: rdp.DefaultOptions()}))
	must(t, a.SaveSnippet(Snippet{ID: "s", Name: "s", Command: "ls"}))

	without, err := a.ExportBundle(false)
	if err != nil {
		t.Fatal(err)
	}
	if without.SSH[0].Password != "" || without.RDP[0].Password != "" {
		t.Fatal("passwords exported without being asked")
	}

	full, err := a.ExportBundle(true)
	if err != nil {
		t.Fatal(err)
	}
	// A child listed before its parent must still import.
	full.Folders = []Folder{{ID: "child", Name: "child", ParentID: "root"}, {ID: "root", Name: "root"}}
	res, err := b.ImportBundle(full)
	if err != nil || res.Folders != 2 || res.Hosts != 2 || res.Snippets != 1 {
		t.Fatalf("import: %+v %v", res, err)
	}
	if pw, _ := b.SSHPassword("h"); pw != "pw" {
		t.Fatalf("ssh password %q", pw)
	}
	if r, _ := b.GetRDPProfile("r"); r.Password != "rpw" {
		t.Fatalf("rdp password %q", r.Password)
	}
	if p, _ := b.GetSSHProfile("h"); p.FolderID != "child" {
		t.Fatalf("folder %q", p.FolderID)
	}
	// Importing twice is a no-op merge, not a duplicate.
	if _, err := b.ImportBundle(full); err != nil {
		t.Fatal(err)
	}
	if l, _ := b.ListSSHProfiles(); len(l) != 1 {
		t.Fatalf("duplicated hosts: %d", len(l))
	}
	if _, err := b.ImportBundle(Bundle{Version: 99}); err == nil {
		t.Fatal("future version accepted")
	}
}
