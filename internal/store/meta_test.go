package store

import (
	"testing"

	"terminyxx/internal/inventory"
)

func TestHostMeta(t *testing.T) {
	s, _, _ := openTest(t)
	must(t, s.SaveSSHProfile(SSHProfile{ID: "a", Name: "a", Host: "h", Port: 22, Username: "u", AuthType: "password"}))
	must(t, s.SaveHostMeta(HostMeta{Kind: KindSSH, ID: "a", Favorite: true, Tags: []string{" Prod ", "#prod", "web server"}, Notes: "owner: ops"}))
	must(t, s.TouchHost(KindSSH, "a"))
	list, err := s.ListHostMeta()
	must(t, err)
	if len(list) != 1 || !list[0].Favorite || list[0].Notes != "owner: ops" || list[0].LastUsed == 0 {
		t.Fatalf("meta = %+v", list)
	}
	if got := list[0].Tags; len(got) != 2 || got[0] != "prod" || got[1] != "web-server" {
		t.Errorf("tags = %v", got)
	}
	// Saving the star again keeps the last use.
	must(t, s.SaveHostMeta(HostMeta{Kind: KindSSH, ID: "a"}))
	list, _ = s.ListHostMeta()
	if list[0].LastUsed == 0 || list[0].Favorite {
		t.Errorf("after save: %+v", list[0])
	}
	if s.SaveHostMeta(HostMeta{Kind: "x", ID: "a"}) == nil {
		t.Error("bad kind accepted")
	}
	must(t, s.DeleteSSHProfile("a"))
	if list, _ = s.ListHostMeta(); len(list) != 0 {
		t.Errorf("meta left after delete: %+v", list)
	}
}

func TestProxyPassword(t *testing.T) {
	s, sec, _ := openTest(t)
	p := SSHProfile{ID: "a", Name: "a", Host: "h", Port: 22, Username: "u", AuthType: "password",
		Proxy: ProxySettings{Type: "socks5", Host: "proxy", Port: 1080, Username: "pu", Password: "pp"}}
	must(t, s.SaveSSHProfile(p))
	got, err := s.GetSSHProfile("a")
	must(t, err)
	if got.Proxy.Password != "" || !got.Proxy.HasPassword || got.Proxy.Host != "proxy" {
		t.Fatalf("proxy = %+v", got.Proxy)
	}
	if pw, _ := s.ProxyPassword("a"); pw != "pp" {
		t.Errorf("proxy password = %q", pw)
	}
	// Saving without a password keeps it; switching to no proxy drops it.
	got.Proxy.HasPassword = false
	must(t, s.SaveSSHProfile(got))
	if pw, _ := s.ProxyPassword("a"); pw != "pp" {
		t.Errorf("kept = %q", pw)
	}
	got.Proxy = ProxySettings{}
	must(t, s.SaveSSHProfile(got))
	if _, err := sec.Get(proxySecretKey("a")); err == nil {
		t.Error("proxy password left after removing the proxy")
	}
}

func TestSyncResetsProxyCommand(t *testing.T) {
	p := SSHProfile{Proxy: ProxySettings{Type: "command", Command: "nc %h %p"}, X11Forwarding: true}
	if !resetRiskyFlags(&p, nil) || p.Proxy.Type != "" || p.X11Forwarding {
		t.Errorf("not reset: %+v", p)
	}
	local := SSHProfile{Proxy: ProxySettings{Type: "command", Command: "nc %h %p"}}
	p = SSHProfile{Proxy: ProxySettings{Type: "command", Command: "nc %h %p"}}
	if resetRiskyFlags(&p, &local) || p.Proxy.Type != "command" {
		t.Errorf("same command was reset: %+v", p)
	}
}

func TestApplyInventory(t *testing.T) {
	s, sec, _ := openTest(t)
	_ = sec
	inv := Inventory{ID: "i", Name: "Prod AWS", Kind: inventory.KindAWS, Secret: "k",
		Config: inventory.Config{AccessKeyID: "AKID", Regions: []string{"eu-west-1"}, Username: "ec2-user"}}
	must(t, s.SaveInventory(inv))
	list := []inventory.Instance{
		{ExternalID: "r/i-1", Name: "web", Address: "10.0.0.1", Tags: []string{"aws"}},
		{ExternalID: "r/i-2", Name: "win", Address: "10.0.0.2", Windows: true},
		{ExternalID: "r/i-3", Name: "noip"},
	}
	res, err := s.ApplyInventory("i", list)
	must(t, err)
	if res.Added != 2 || res.NoAddress != 1 {
		t.Fatalf("first sync = %+v", res)
	}
	ssh, _ := s.ListSSHProfiles()
	rdps, _ := s.ListRDPProfiles()
	if len(ssh) != 1 || ssh[0].Username != "ec2-user" || ssh[0].FolderID == "" || len(rdps) != 1 {
		t.Fatalf("hosts: %+v %+v", ssh, rdps)
	}
	// The user changes the login; a refresh moves the address and keeps it.
	ssh[0].Username = "admin"
	must(t, s.SaveSSHProfile(ssh[0]))
	list[0].Address = "10.0.0.9"
	res, err = s.ApplyInventory("i", list[:1])
	must(t, err)
	if res.Updated != 1 || res.Added != 0 || len(res.Gone) != 1 || res.Gone[0] != "win" {
		t.Fatalf("second sync = %+v", res)
	}
	got, _ := s.GetSSHProfile(ssh[0].ID)
	if got.Host != "10.0.0.9" || got.Username != "admin" {
		t.Errorf("refreshed host = %+v", got)
	}
	invs, _ := s.ListInventories()
	if len(invs) != 1 || invs[0].Hosts != 2 || invs[0].LastSync == 0 || !invs[0].HasSecret {
		t.Errorf("inventory = %+v", invs)
	}
}
