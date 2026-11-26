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
	without.SSH[0].Name = "Renamed host"
	if _, err := b.ImportBundle(without); err != nil {
		t.Fatal(err)
	}
	profile, err := b.GetSSHProfile("h")
	must(t, err)
	pw, err := b.SSHPassword("h")
	must(t, err)
	if profile.Name != "Renamed host" || pw != "pw" {
		t.Fatal("same-destination import must merge metadata and preserve the saved password")
	}
	if _, err := b.ImportBundle(Bundle{Version: 99}); err == nil {
		t.Fatal("future version accepted")
	}
}

func TestImportResetsRiskyFlagsAndReportsConflicts(t *testing.T) {
	s, err := Open(filepath.Join(t.TempDir(), "t.db"), NewMemorySecrets())
	must(t, err)
	defer s.Close()
	keep := Tunnel{ID: "t1", Kind: "local", BindPort: 8080, DestHost: "db", DestPort: 5432, AutoStart: true}
	must(t, s.SaveSSHProfile(SSHProfile{ID: "a", Name: "a", Host: "old", Port: 22, Username: "u", AgentForwarding: true, Tunnels: []Tunnel{keep}}))

	res, err := s.ImportBundle(Bundle{Version: BundleVersion, SSH: []SSHProfile{
		// Existing host: keep its local profile and permissions intact.
		{ID: "a", Name: "a", Host: "other", Port: 22, Username: "u", AgentForwarding: true,
			Tunnels: []Tunnel{keep, {ID: "t2", Kind: "dynamic", BindPort: 1080, AutoStart: true}}},
		// New host: restricted settings require local approval.
		{ID: "b", Name: "b", Host: "h", Port: 22, Username: "u", AgentForwarding: true, AllowLegacyAlgorithms: true},
	}})
	must(t, err)
	if len(res.SkippedConflicts) != 1 || res.SkippedConflicts[0] != "a" || res.FlagsReset != 1 || res.Hosts != 1 {
		t.Fatalf("result %+v", res)
	}
	a, _ := s.GetSSHProfile("a")
	if a.Host != "old" || !a.AgentForwarding || len(a.Tunnels) != 1 || a.Tunnels[0] != keep {
		t.Fatalf("host a %+v", a)
	}
	if b, _ := s.GetSSHProfile("b"); b.AgentForwarding || b.AllowLegacyAlgorithms {
		t.Fatal("restricted settings imported for a new host")
	}
}

func TestImportKeepsPasswordsWithLocalSSHDestinations(t *testing.T) {
	s, _, _ := openTest(t)
	hop := SSHProfile{ID: "jump", Name: "Jump", Host: "jump.example", Port: 22, Username: "u", Password: "jump-fixture"}
	target := SSHProfile{ID: "target", Name: "Target", Host: "target.example", Port: 22, Username: "u",
		JumpProfileID: hop.ID, AgentForwarding: true, Password: "target-fixture",
		Proxy: ProxySettings{Type: "http", Host: "proxy.example", Port: 3128, Username: "proxy-user", Password: "proxy-fixture"}}
	must(t, s.SaveSSHProfile(hop))
	must(t, s.SaveSSHProfile(target))
	hop.Host, hop.Password = "changed-jump.example", ""
	target.Proxy.Host, target.Proxy.Password, target.Password = "changed-proxy.example", "", ""
	res, err := s.ImportBundle(Bundle{Version: BundleVersion, SSH: []SSHProfile{target, hop}})
	must(t, err)
	if res.Hosts != 0 || len(res.SkippedConflicts) != 2 {
		t.Fatalf("import result: %+v", res)
	}
	for id, want := range map[string]string{hop.ID: "jump-fixture", target.ID: "target-fixture"} {
		got, err := s.SSHPassword(id)
		must(t, err)
		if got != want {
			t.Fatalf("saved password changed for %s", id)
		}
	}
	p, err := s.GetSSHProfile(target.ID)
	must(t, err)
	if p.Proxy.Host != "proxy.example" || p.JumpProfileID != hop.ID || !p.AgentForwarding {
		t.Fatalf("local route or permission changed: %+v", p)
	}
	p, err = s.GetSSHProfile(hop.ID)
	must(t, err)
	if p.Host != "jump.example" {
		t.Fatalf("local jump address changed: %+v", p)
	}
	if pw, err := s.ProxyPassword(target.ID); err != nil || pw != "proxy-fixture" {
		t.Fatal("saved proxy password changed")
	}
}

func TestImportRequiresLocalApprovalToUseAnExistingIdentityOnANewHost(t *testing.T) {
	s, _, _ := openTest(t)
	local := Identity{ID: "i", Name: "Local login", Username: "local-user", Password: "identity-fixture"}
	must(t, s.SaveIdentity(local))
	incoming := local
	incoming.Username, incoming.Password = "other-user", ""
	res, err := s.ImportBundle(Bundle{Version: BundleVersion, Identities: []Identity{incoming},
		SSH: []SSHProfile{{ID: "new", Name: "New", Host: "new.example", Username: "other-user", IdentityID: local.ID}}})
	must(t, err)
	if res.Hosts != 1 || res.Identities != 0 || res.FlagsReset != 1 || len(res.SkippedConflicts) != 1 {
		t.Fatalf("import result: %+v", res)
	}
	identity, err := s.GetIdentity(local.ID)
	must(t, err)
	if identity.Username != local.Username || !identity.HasPassword {
		t.Fatalf("local login changed: %+v", identity)
	}
	p, err := s.GetSSHProfile("new")
	must(t, err)
	if p.IdentityID != "" || p.HasPassword {
		t.Fatalf("new host inherited a local login: %+v", p)
	}
}

func TestRDPImportKeepsRedirectionLocal(t *testing.T) {
	s, err := Open(filepath.Join(t.TempDir(), "t.db"), NewMemorySecrets())
	must(t, err)
	defer s.Close()
	local := rdp.RDPProfile{ID: "existing", Host: "work", Port: 3389, Options: rdp.Options{
		Clipboard: true, Drives: true, DrivePaths: []string{"allowed"}, DrivesReadOnly: true,
	}}
	local.Password = "rdp-fixture"
	must(t, s.SaveRDPProfile(local))
	incoming := local
	incoming.Password = ""
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
	incoming.Options.Gateway = "changed-gateway.example"
	res, err = s.ImportBundle(Bundle{Version: BundleVersion, RDP: []rdp.RDPProfile{incoming}})
	must(t, err)
	if res.Hosts != 0 || len(res.SkippedConflicts) != 1 {
		t.Fatalf("changed destination import result: %+v", res)
	}
	changed, err := s.GetRDPProfile(local.ID)
	must(t, err)
	assertNoEscalation(changed)
	if changed.Options.Gateway != local.Options.Gateway || changed.Password != local.Password || !changed.Options.Clipboard ||
		!changed.Options.Drives || len(changed.Options.DrivePaths) != 1 || changed.Options.DrivePaths[0] != "allowed" {
		t.Fatal("changed gateway overwrote the saved RDP profile")
	}
}
