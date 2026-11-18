package sshconfig

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const sample = `
# global default
ServerAliveInterval 30

Host web prod-web
    HostName 10.0.0.5
    User deploy
    Port=2222
    IdentityFile ~/.ssh/deploy_ed25519

Host db
    HostName db.internal
    ProxyJump bastion

Host bastion
    HostName "bastion.example.com"

Host *.example.com !skip.example.com
    User admin

Host plain.example.com skip.example.com

Match host foo
    User ignored

Host *
    User fallback
    Port 22
`

func TestParse(t *testing.T) {
	hosts, err := Parse(strings.NewReader(sample))
	if err != nil {
		t.Fatal(err)
	}
	byAlias := map[string]Host{}
	var order []string
	for _, h := range hosts {
		byAlias[h.Alias] = h
		order = append(order, h.Alias)
	}
	want := []string{"web", "prod-web", "db", "bastion", "plain.example.com", "skip.example.com"}
	if strings.Join(order, ",") != strings.Join(want, ",") {
		t.Fatalf("aliases = %v, want %v (wildcards skipped, file order)", order, want)
	}

	web := byAlias["web"]
	if web.HostName != "10.0.0.5" || web.User != "deploy" || web.Port != 2222 {
		t.Fatalf("web = %+v", web)
	}
	if !strings.HasSuffix(filepath.ToSlash(web.IdentityFile), ".ssh/deploy_ed25519") || strings.HasPrefix(web.IdentityFile, "~") {
		t.Fatalf("identity not expanded: %q", web.IdentityFile)
	}
	if byAlias["prod-web"].HostName != "10.0.0.5" {
		t.Fatal("second alias on the same Host line not resolved")
	}
	db := byAlias["db"]
	if db.ProxyJump != "bastion" || db.User != "fallback" || db.Port != 22 {
		t.Fatalf("db = %+v (Host * should supply defaults)", db)
	}
	if byAlias["bastion"].HostName != "bastion.example.com" {
		t.Fatal("quoted value not unquoted")
	}
	// Wildcard block applies, first value wins over Host *.
	if byAlias["plain.example.com"].User != "admin" {
		t.Fatalf("pattern match failed: %+v", byAlias["plain.example.com"])
	}
	// Negated pattern excludes the host from that block.
	if byAlias["skip.example.com"].User != "fallback" {
		t.Fatalf("negation failed: %+v", byAlias["skip.example.com"])
	}
	// HostName defaults to the alias.
	if byAlias["plain.example.com"].HostName != "plain.example.com" {
		t.Fatal("hostname default")
	}
}

func TestInclude(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "conf.d"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "conf.d", "work.conf"), []byte("Host work\n  HostName work.local\n  User me\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	main := filepath.Join(dir, "config")
	if err := os.WriteFile(main, []byte("Include conf.d/*.conf\n\nHost home\n  HostName 192.168.1.2\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	hosts, err := ParseFile(main)
	if err != nil {
		t.Fatal(err)
	}
	if len(hosts) != 2 || hosts[0].Alias != "work" || hosts[0].User != "me" || hosts[1].Alias != "home" {
		t.Fatalf("include: %+v", hosts)
	}
}

func TestExportRoundTrip(t *testing.T) {
	out := Export([]ExportHost{
		{ID: "1", Name: "Bastion host", HostName: "bastion.example.com", User: "ops", Port: 2222},
		{ID: "2", Name: "db", HostName: "10.0.0.9", User: "admin", IdentityFile: "/home/me/my keys/id", JumpID: "1", ForwardAgent: true,
			LocalForwards: []string{"127.0.0.1:5432 localhost:5432"}},
		{ID: "3", Name: "db", HostName: "10.0.0.10", ProxyCommand: "cloudflared access ssh --hostname %h"},
	}, "Exported by Terminyxx")
	if !strings.HasPrefix(out, "# Exported by Terminyxx\n") {
		t.Errorf("header missing:\n%s", out)
	}
	hosts, err := Parse(strings.NewReader(out))
	if err != nil {
		t.Fatal(err)
	}
	if len(hosts) != 3 {
		t.Fatalf("parsed %d hosts:\n%s", len(hosts), out)
	}
	b, db, db2 := hosts[0], hosts[1], hosts[2]
	if b.Alias != "Bastion-host" || b.Port != 2222 || b.User != "ops" {
		t.Errorf("bastion = %+v", b)
	}
	if db.ProxyJump != "Bastion-host" || db.IdentityFile != "/home/me/my keys/id" {
		t.Errorf("db = %+v", db)
	}
	if db2.Alias != "db-2" || db2.ProxyCommand != "cloudflared access ssh --hostname %h" {
		t.Errorf("db2 = %+v", db2)
	}
}
