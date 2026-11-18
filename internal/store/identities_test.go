package store

import (
	"encoding/json"
	"testing"
)

func TestIdentityAppliesToHosts(t *testing.T) {
	s, sec, _ := openTest(t)
	must(t, s.SaveIdentity(Identity{ID: "i1", Name: "ops", Username: "deploy", AuthType: "password", Password: "shared"}))
	must(t, s.SaveSSHProfile(SSHProfile{ID: "h1", Name: "a", Host: "a.example", Port: 22, Username: "old", AuthType: "key", Password: "own", IdentityID: "i1"}))
	must(t, s.SaveSSHProfile(SSHProfile{ID: "h2", Name: "b", Host: "b.example", Port: 22, Username: "root", AuthType: "password", Password: "mine"}))

	// The host's own password is not written while an identity is set.
	if _, err := sec.Get("ssh:h1"); err == nil {
		t.Fatal("password of a host with an identity should not be stored on the host")
	}
	p, err := s.GetSSHProfile("h1")
	must(t, err)
	if p.Username != "deploy" || p.AuthType != "password" || !p.HasPassword {
		t.Fatalf("identity not applied: %+v", p)
	}
	if pw, _ := s.SSHPassword("h1"); pw != "shared" {
		t.Fatalf("SSHPassword = %q, want the identity's", pw)
	}
	if pw, _ := s.SSHPassword("h2"); pw != "mine" {
		t.Fatalf("host without identity: %q", pw)
	}

	// Changing the identity's password changes it for every host.
	must(t, s.SaveIdentity(Identity{ID: "i1", Name: "ops", Username: "deploy2", AuthType: "password", Password: "rotated"}))
	if pw, _ := s.SSHPassword("h1"); pw != "rotated" {
		t.Fatalf("after rotation: %q", pw)
	}
	list, err := s.ListIdentities()
	must(t, err)
	if len(list) != 1 || list[0].Hosts != 1 || !list[0].HasPassword || list[0].Password != "" {
		t.Fatalf("ListIdentities = %+v", list)
	}
	keys, _ := s.SecretKeys()
	found := false
	for _, k := range keys {
		found = found || k == "ident:i1"
	}
	if !found {
		t.Fatal("SecretKeys must include identities so the vault re-seals them")
	}

	// Deleting the identity leaves the host with a copy of its login.
	must(t, s.DeleteIdentity("i1"))
	p, err = s.GetSSHProfile("h1")
	must(t, err)
	if p.IdentityID != "" || p.Username != "deploy2" || p.AuthType != "password" {
		t.Fatalf("after delete: %+v", p)
	}
	if pw, _ := s.SSHPassword("h1"); pw != "rotated" {
		t.Fatalf("password not copied to host: %q", pw)
	}
	if _, err := sec.Get("ident:i1"); err == nil {
		t.Fatal("identity secret should be deleted")
	}
}

func TestUnknownIdentityIsDropped(t *testing.T) {
	s, _, _ := openTest(t)
	must(t, s.SaveSSHProfile(SSHProfile{ID: "h", Name: "h", Host: "h", Port: 22, Username: "u", AuthType: "password", IdentityID: "missing"}))
	p, err := s.GetSSHProfile("h")
	must(t, err)
	if p.IdentityID != "" {
		t.Fatal("a missing identity must not be saved")
	}
}

func TestBundleCarriesIdentities(t *testing.T) {
	src, _, _ := openTest(t)
	must(t, src.SaveIdentity(Identity{ID: "i", Name: "ops", Username: "deploy", AuthType: "key", KeyPath: "~/.ssh/ops"}))
	must(t, src.SaveSSHProfile(SSHProfile{ID: "h", Name: "h", Host: "h", Port: 22, Username: "x", AuthType: "password", IdentityID: "i"}))
	b, err := src.ExportBundle(true)
	must(t, err)
	raw, _ := json.Marshal(b)
	var back Bundle
	must(t, json.Unmarshal(raw, &back))

	dst, _, _ := openTest(t)
	res, err := dst.ImportBundle(back)
	must(t, err)
	if res.Identities != 1 {
		t.Fatalf("imported %d identities", res.Identities)
	}
	p, err := dst.GetSSHProfile("h")
	must(t, err)
	if p.IdentityID != "i" || p.Username != "deploy" || p.KeyPath != "~/.ssh/ops" {
		t.Fatalf("host after import: %+v", p)
	}
}
