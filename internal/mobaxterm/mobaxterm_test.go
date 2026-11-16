package mobaxterm

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/text/encoding/charmap"
)

// Field layout copied from a real MobaXterm export (39 %-fields for SSH),
// with made-up hosts.
const sshTail = `%%-1%-1%%%%%0%-1%0%%%-1%0%0%0%%1080%%0%0%1%%0%%%%0%-1%-1%0#MobaFont%10%0%0%-1%15%236,236,236%30,30,30%180,180,192%0%-1%0%%xterm%-1%0%_Std_Colors_0_%80%24%0%1%-1%<none>%%0%0%-1#0# #-1`

func ssh(host, port, user, key string) string {
	f := strings.Split(sshTail, "%")
	// fields after user: 4.. ; key lives at index 14 overall
	fields := append([]string{"0", host, port, user}, f[1:]...)
	fields[14] = key
	return "#109#" + strings.Join(fields, "%")
}

func sample() string {
	return strings.Join([]string{
		"[Misc]",
		"Foo=bar",
		"[Bookmarks]",
		"SubRep=",
		"ImgNum=42",
		"nas=" + ssh("192.168.1.20", "22", "admin", ""),
		"[Bookmarks_1]",
		`SubRep=Work\Production`,
		"ImgNum=41",
		"web-01=" + ssh("10.0.0.5", "2218", "deploy", `_ProfileDir_\.ssh\deploy key\id_rsa`),
		"db __DIEZE__1=" + ssh("db.internal", "22", "postgres", `_ProfileDir_\.ssh\id_ed25519.pub`),
		"office=#91#4%office.local%3389%me%%-1%0%0%-1%0%0#MobaFont%10#0# #-1",
		"router=#98#1%10.0.0.1%23%%%2%%%%%0%0#MobaFont#0# #-1",
		"[Bookmarks_2]",
		"SubRep=Дом",
		"ImgNum=41",
		"Сервер=" + ssh("home.example.com", "41022", "андрей", ""),
		"[Passwords]",
		"ssh22:admin@192.168.1.20=encrypted",
	}, "\r\n")
}

func TestParse(t *testing.T) {
	res := Parse(strings.NewReader(sample()))
	if len(res.Sessions) != 5 {
		t.Fatalf("got %d sessions: %+v", len(res.Sessions), res.Sessions)
	}
	by := map[string]Session{}
	for _, s := range res.Sessions {
		by[s.Name] = s
	}

	nas := by["nas"]
	if nas.Kind != "ssh" || nas.Host != "192.168.1.20" || nas.Port != 22 || nas.User != "admin" || len(nas.Folder) != 0 || nas.KeyFile != "" {
		t.Fatalf("nas = %+v", nas)
	}

	web := by["web-01"]
	if web.Port != 2218 || strings.Join(web.Folder, "/") != "Work/Production" {
		t.Fatalf("web = %+v", web)
	}
	home, _ := os.UserHomeDir()
	if web.KeyFile != filepath.Join(home, ".ssh", "deploy key", "id_rsa") {
		t.Fatalf("key placeholder not expanded: %q", web.KeyFile)
	}

	db, ok := by["db #1"]
	if !ok {
		t.Fatalf("escaped name not decoded: %v", res.Sessions)
	}
	if !strings.HasSuffix(db.KeyFile, "id_ed25519") {
		t.Fatalf(".pub not mapped to private key: %q", db.KeyFile)
	}

	office := by["office"]
	if office.Kind != "rdp" || office.Port != 3389 || office.User != "me" {
		t.Fatalf("rdp = %+v", office)
	}

	ru := by["Сервер"]
	if ru.User != "андрей" || ru.Port != 41022 || strings.Join(ru.Folder, "/") != "Дом" {
		t.Fatalf("unicode session = %+v", ru)
	}

	if res.Skipped["Telnet"] != 1 {
		t.Fatalf("skipped = %v", res.Skipped)
	}
}

func TestGateway(t *testing.T) {
	v := ssh("10.1.0.9", "22", "app", "")
	f := strings.Split(strings.TrimPrefix(v, "#109#"), "%")
	f[7], f[8], f[9] = "bastion.example.com", "2222", "jump"
	res := Parse(strings.NewReader("[Bookmarks]\nSubRep=\ninner=#109#" + strings.Join(f, "%")))
	if len(res.Sessions) != 1 || res.Sessions[0].Gateway != "jump@bastion.example.com:2222" {
		t.Fatalf("gateway = %+v", res.Sessions)
	}
}

// MobaXterm writes ANSI (cp1251 on Russian Windows), not UTF-8.
func TestParseFileANSI(t *testing.T) {
	enc, err := charmap.Windows1251.NewEncoder().String(sample())
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "s.mxtsessions")
	if err := os.WriteFile(path, []byte(enc), 0o644); err != nil {
		t.Fatal(err)
	}
	if ansiCodePage() != 1251 {
		t.Skipf("system code page is %d, not 1251", ansiCodePage())
	}
	res, err := ParseFile(path)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, s := range res.Sessions {
		if s.Name == "Сервер" && s.User == "андрей" && s.Folder[0] == "Дом" {
			found = true
		}
	}
	if !found {
		t.Fatalf("cp1251 not decoded: %+v", res.Sessions)
	}
}

func TestParseFileUTF8BOM(t *testing.T) {
	path := filepath.Join(t.TempDir(), "s.mxtsessions")
	if err := os.WriteFile(path, append([]byte("\xef\xbb\xbf"), sample()...), 0o644); err != nil {
		t.Fatal(err)
	}
	res, err := ParseFile(path)
	if err != nil || len(res.Sessions) != 5 {
		t.Fatalf("utf-8 with BOM: %v %+v", err, res.Sessions)
	}
}
