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

func TestImportResetsRiskyFlagsAndReportsReplaced(t *testing.T) {
	s, err := Open(filepath.Join(t.TempDir(), "t.db"), NewMemorySecrets())
	must(t, err)
	defer s.Close()
	keep := Tunnel{ID: "t1", Kind: "local", BindPort: 8080, DestHost: "db", DestPort: 5432, AutoStart: true}
	must(t, s.SaveSSHProfile(SSHProfile{ID: "a", Name: "a", Host: "old", Port: 22, Username: "u", AgentForwarding: true, Tunnels: []Tunnel{keep}}))

	res, err := s.ImportBundle(Bundle{Version: BundleVersion, SSH: []SSHProfile{
		// Existing host: address changed, its own agent forwarding and tunnel kept,
		// a new auto-start tunnel turned off.
		{ID: "a", Name: "a", Host: "evil", Port: 22, Username: "u", AgentForwarding: true,
			Tunnels: []Tunnel{keep, {ID: "t2", Kind: "dynamic", BindPort: 1080, AutoStart: true}}},
		// New host: agent forwarding turned off.
		{ID: "b", Name: "b", Host: "h", Port: 22, Username: "u", AgentForwarding: true},
	}})
	must(t, err)
	if len(res.Replaced) != 1 || res.Replaced[0] != "a" || res.FlagsReset != 2 {
		t.Fatalf("result %+v", res)
	}
	a, _ := s.GetSSHProfile("a")
	if !a.AgentForwarding || !a.Tunnels[0].AutoStart || a.Tunnels[1].AutoStart {
		t.Fatalf("host a %+v", a)
	}
	if b, _ := s.GetSSHProfile("b"); b.AgentForwarding {
		t.Fatal("agent forwarding imported for a new host")
	}
}

func TestRDPImportKeepsRedirectionLocal(t *testing.T) {
	s, err := Open(filepath.Join(t.TempDir(), "t.db"), NewMemorySecrets())
	must(t, err)
	defer s.Close()
	local := rdp.RDPProfile{ID: "existing", Host: "work", Port: 3389, Options: rdp.Options{
		Clipboard: true, Drives: true, DrivePaths: []string{"allowed"}, DrivesReadOnly: true,
	}}
	must(t, s.SaveRDPProfile(local))
	incoming := local
	incoming.Options = rdp.Options{AllDrives: true, Printers: true, SmartCards: true, Camera: true, Microphone: true}
	newHost := incoming
	newHost.ID = "new"
	res, err := s.ImportBundle(Bundle{Version: BundleVersion, RDP: []rdp.RDPProfile{incoming, newHost}})
	must(t, err)
	if res.RDPRedirectionSkipped != 2 {
		t.Fatalf("redirection changes were not reported: %+v", res)
	}
	same, err := s.GetRDPProfile(local.ID)
	must(t, err)
	if !same.Options.Clipboard || !same.Options.Drives || !same.Options.DrivesReadOnly || len(same.Options.DrivePaths) != 1 || same.Options.DrivePaths[0] != "allowed" {
		t.Fatalf("local permissions were lost: %+v", same.Options)
	}
	assertNoEscalation := func(p rdp.RDPProfile) {
		t.Helper()
		o := p.Options
		if o.AllDrives || o.Printers || o.SmartCards || o.Camera || o.Microphone {
			t.Fatalf("import enabled redirection: %+v", o)
		}
	}
	assertNoEscalation(same)
	added, err := s.GetRDPProfile(newHost.ID)
	must(t, err)
	assertNoEscalation(added)
	incoming.Host = "changed"
	_, err = s.ImportBundle(Bundle{Version: BundleVersion, RDP: []rdp.RDPProfile{incoming}})
	must(t, err)
	changed, err := s.GetRDPProfile(local.ID)
	must(t, err)
	assertNoEscalation(changed)
	if changed.Options.Clipboard || changed.Options.Drives || len(changed.Options.DrivePaths) != 0 {
		t.Fatalf("local permissions followed a changed destination: %+v", changed.Options)
	}
}
