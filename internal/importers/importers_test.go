package importers

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"unicode/utf16"
)

func writeFile(t *testing.T, dir, name string, data []byte) string {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, data, 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func utf16LE(s string) []byte {
	u := utf16.Encode([]rune(s))
	b := []byte{0xFF, 0xFE}
	for _, c := range u {
		b = append(b, byte(c), byte(c>>8))
	}
	return b
}

func byName(hosts []Host) map[string]Host {
	m := map[string]Host{}
	for _, h := range hosts {
		m[h.Name] = h
	}
	return m
}

func TestListAndUnknown(t *testing.T) {
	seen := map[string]bool{}
	for _, s := range List() {
		if seen[s.ID] {
			t.Fatalf("duplicate source %s", s.ID)
		}
		seen[s.ID] = true
	}
	for _, id := range []string{"openssh", "mobaxterm", "putty", "winscp", "securecrt", "tabby", "filezilla", "rdpfiles"} {
		if !seen[id] {
			t.Errorf("source %s not listed", id)
		}
	}
	if _, err := Read("nope", nil); err == nil {
		t.Fatal("unknown source should error")
	}
	res, err := Read("rdpfiles", nil) // no detection: empty, not an error
	if err != nil || len(res.Hosts) != 0 {
		t.Fatalf("empty read: %v %+v", err, res)
	}
}

func TestPuTTYRegExport(t *testing.T) {
	reg := strings.Join([]string{
		"Windows Registry Editor Version 5.00",
		"",
		`[HKEY_CURRENT_USER\Software\SimonTatham\PuTTY\Sessions]`,
		"",
		`[HKEY_CURRENT_USER\Software\SimonTatham\PuTTY\Sessions\Default%20Settings]`,
		`"HostName"=""`,
		"",
		`[HKEY_CURRENT_USER\Software\SimonTatham\PuTTY\Sessions\Web%20server]`,
		`"HostName"="deploy@10.0.0.5"`,
		`"PortNumber"=dword:000008aa`,
		`"Protocol"="ssh"`,
		`"PublicKeyFile"="C:\\Keys\\deploy.ppk"`,
		"",
		`[HKEY_CURRENT_USER\Software\SimonTatham\PuTTY\Sessions\Router]`,
		`"HostName"="10.0.0.1"`,
		`"Protocol"="telnet"`,
		"",
		`[HKEY_CURRENT_USER\Software\SimonTatham\PuTTY\Sessions\Web%20server\Sub]`,
		`"HostName"="ignored"`,
	}, "\r\n")
	p := writeFile(t, t.TempDir(), "putty.reg", utf16LE(reg))
	res, err := readPuTTYLike([]string{p}, puttyKey)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Hosts) != 1 {
		t.Fatalf("hosts = %+v", res.Hosts)
	}
	h := res.Hosts[0]
	if h.Name != "Web server" || h.Host != "10.0.0.5" || h.User != "deploy" || h.Port != 2218 || h.KeyFile != `C:\Keys\deploy.ppk` {
		t.Fatalf("putty host = %+v", h)
	}
	if res.Skipped["Telnet"] != 1 {
		t.Fatalf("skipped = %v", res.Skipped)
	}
}

func TestKiTTYFolder(t *testing.T) {
	hosts, _ := puttySessions(map[string]map[string]string{
		"db": {"HostName": "db.local", "UserName": "pg", "Folder": `Work\Databases`},
	})
	if len(hosts) != 1 || strings.Join(hosts[0].Folder, "/") != "Work/Databases" || hosts[0].Port != 22 {
		t.Fatalf("kitty = %+v", hosts)
	}
}

func TestWinSCPIni(t *testing.T) {
	ini := strings.Join([]string{
		"[Configuration\\Interface]",
		"Foo=1",
		"[Sessions\\Default%20Settings]",
		"HostName=",
		"[Sessions\\Work/Prod%20DB]",
		"HostName=db.example.com",
		"UserName=%D0%B0%D0%B4%D0%BC%D0%B8%D0%BD", // "админ"
		"PortNumber=2222",
		"PublicKeyFile=C:%5CKeys%5Cdb.ppk",
		"Tunnel=1",
		"TunnelHostName=bastion",
		"TunnelUserName=jump",
		"[Sessions\\ftp%20site]",
		"HostName=ftp.example.com",
		"FSProtocol=5",
		"[Sessions\\plain]",
		"HostName=10.0.0.9",
	}, "\r\n")
	p := writeFile(t, t.TempDir(), "WinSCP.ini", []byte(ini))
	res, err := readWinSCP([]string{p})
	if err != nil {
		t.Fatal(err)
	}
	by := byName(res.Hosts)
	db := by["Prod DB"]
	if strings.Join(db.Folder, "/") != "Work" || db.User != "админ" || db.Port != 2222 || db.KeyFile != `C:\Keys\db.ppk` || db.Warning != "via jump@bastion" {
		t.Fatalf("winscp db = %+v", db)
	}
	if by["plain"].Port != 22 || len(res.Hosts) != 2 || res.Skipped["FTP"] != 1 {
		t.Fatalf("winscp = %+v skipped=%v", res.Hosts, res.Skipped)
	}
}

func TestSecureCRT(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "__FolderData__.ini", []byte(`S:"Folder List"=`))
	writeFile(t, dir, "Default.ini", []byte(`S:"Hostname"=template`))
	writeFile(t, dir, filepath.Join("Production", "web-01.ini"), append([]byte{0xEF, 0xBB, 0xBF}, strings.Join([]string{
		`S:"Protocol Name"=SSH2`,
		`S:"Hostname"=10.0.0.5`,
		`S:"Username"=deploy`,
		`D:"[SSH2] Port"=000008aa`,
		`S:"Identity Filename V2"=C:\keys\id_ed25519.pub*RawKey`,
		`S:"Firewall Name"=Session:bastion`,
	}, "\r\n")...))
	writeFile(t, dir, "switch.ini", []byte("S:\"Protocol Name\"=Telnet\r\nS:\"Hostname\"=10.0.0.1\r\n"))
	res, err := readSecureCRT([]string{dir})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Hosts) != 1 {
		t.Fatalf("hosts = %+v", res.Hosts)
	}
	h := res.Hosts[0]
	if h.Name != "web-01" || strings.Join(h.Folder, "/") != "Production" || h.Port != 2218 || h.User != "deploy" ||
		!strings.HasSuffix(filepath.ToSlash(h.KeyFile), "keys/id_ed25519") || h.Warning != "via bastion" {
		t.Fatalf("securecrt = %+v", h)
	}
	if res.Skipped["Telnet"] != 1 {
		t.Fatalf("skipped = %v", res.Skipped)
	}
}

func TestTabby(t *testing.T) {
	yml := `
version: 3
groups:
  - id: g1
    name: Production
profiles:
  - type: ssh
    id: ssh:bastion
    name: bastion
    options: {host: bastion.example.com, user: jump}
  - type: ssh
    id: ssh:web
    name: web-01
    group: g1
    options:
      host: 10.0.0.5
      port: 2222
      user: deploy
      privateKeys:
        - file:///C:/Users/me/.ssh/id_ed25519
      jumpHost: ssh:bastion
  - type: serial
    name: console
  - type: local
    name: shell
`
	p := writeFile(t, t.TempDir(), "config.yaml", []byte(yml))
	res, err := readTabby([]string{p})
	if err != nil {
		t.Fatal(err)
	}
	by := byName(res.Hosts)
	web := by["web-01"]
	if web.Port != 2222 || strings.Join(web.Folder, "/") != "Production" || web.Warning != "via bastion" ||
		filepath.ToSlash(web.KeyFile) != "C:/Users/me/.ssh/id_ed25519" {
		t.Fatalf("tabby web = %+v", web)
	}
	if by["bastion"].Port != 22 || len(res.Hosts) != 2 || res.Skipped["serial"] != 1 {
		t.Fatalf("tabby = %+v %v", res.Hosts, res.Skipped)
	}
}

func TestFileZilla(t *testing.T) {
	x := `<?xml version="1.0" encoding="UTF-8"?>
<FileZilla3 version="3.66.0">
  <Servers>
    <Server><Host>nas.local</Host><Port>22</Port><Protocol>1</Protocol><User>admin</User><Name>NAS</Name></Server>
    <Folder expanded="1">Clients
      <Folder>Acme
        <Server><Host>sftp.acme.com</Host><Port>2022</Port><Protocol>1</Protocol><User>me</User><Keyfile>/home/me/.ssh/acme</Keyfile><Name>Acme SFTP</Name></Server>
        <Server><Host>ftp.acme.com</Host><Port>21</Port><Protocol>0</Protocol><Name>Acme FTP</Name></Server>
      </Folder>
    </Folder>
  </Servers>
</FileZilla3>`
	p := writeFile(t, t.TempDir(), "sitemanager.xml", []byte(x))
	res, err := readFileZilla([]string{p})
	if err != nil {
		t.Fatal(err)
	}
	by := byName(res.Hosts)
	if len(res.Hosts) != 2 || by["NAS"].User != "admin" || len(by["NAS"].Folder) != 0 {
		t.Fatalf("filezilla = %+v", res.Hosts)
	}
	acme := by["Acme SFTP"]
	if strings.Join(acme.Folder, "/") != "Clients/Acme" || acme.Port != 2022 || res.Skipped["FTP"] != 1 {
		t.Fatalf("acme = %+v skipped=%v", acme, res.Skipped)
	}
}

func TestRDPFiles(t *testing.T) {
	dir := t.TempDir()
	a := writeFile(t, dir, "Office PC.rdp", utf16LE("screen mode id:i:2\r\ndesktopwidth:i:2560\r\ndesktopheight:i:1440\r\nfull address:s:office.local:3390\r\nusername:s:CORP\\alice\r\n"))
	b := writeFile(t, dir, "lab.rdp", []byte("full address:s:10.0.0.7\r\nusername:s:bob\r\n"))
	writeFile(t, dir, "broken.rdp", []byte("nothing here"))
	res, err := readRDPFiles([]string{a, b, filepath.Join(dir, "broken.rdp")})
	if err != nil {
		t.Fatal(err)
	}
	by := byName(res.Hosts)
	o := by["Office PC"]
	if o.Kind != "rdp" || o.Host != "office.local" || o.Port != 3390 || o.Domain != "CORP" || o.User != "alice" || !o.Fullscreen || o.Width != 2560 {
		t.Fatalf("rdp = %+v", o)
	}
	if by["lab"].Port != 3389 || by["lab"].User != "bob" || len(res.Hosts) != 2 {
		t.Fatalf("rdp lab = %+v", res.Hosts)
	}
}
