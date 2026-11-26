// Package mobaxterm reads saved sessions from MobaXterm: an exported
// .mxtsessions file or MobaXterm.ini. Both use the same INI layout:
//
//	[Bookmarks_1]
//	SubRep=Folder\Subfolder
//	ImgNum=41
//	web-01=#109#0%10.0.0.5%22%deploy%%-1%-1%%%%%0%-1%0%_ProfileDir_\.ssh\id_ed25519%...#...
//
// The session value is "#<icon>#<fields joined by %>#<terminal settings>#...".
// Field 0 is the session type, then host, port and user. For SSH, field 14 is
// the private key and fields 7–9 the SSH gateway (jump host).
package mobaxterm

import (
	"bufio"
	"bytes"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"unicode/utf8"

	"golang.org/x/text/encoding/charmap"
	"terminyxx/internal/importfile"
)

// Session is one imported session. Kind is "ssh" or "rdp"; other MobaXterm
// session types are counted in Result.Skipped instead.
type Session struct {
	Name    string   `json:"name"`
	Folder  []string `json:"folder"`
	Kind    string   `json:"kind"`
	Host    string   `json:"host"`
	Port    int      `json:"port"`
	User    string   `json:"user"`
	KeyFile string   `json:"keyFile"`
	Gateway string   `json:"gateway"`
}

type Result struct {
	Path     string         `json:"path"`
	Sessions []Session      `json:"sessions"`
	Skipped  map[string]int `json:"skipped"` // type name -> count
}

// MobaXterm session type numbers.
var typeNames = map[string]string{
	"0": "SSH", "1": "Telnet", "2": "Rsh", "3": "XDMCP", "4": "RDP", "5": "VNC",
	"6": "FTP", "7": "SFTP", "8": "Serial", "9": "File", "10": "Shell",
	"11": "Browser", "12": "Mosh", "13": "AWS S3", "14": "WSL",
}

// MobaXterm escapes characters that would break its format.
var unescaper = strings.NewReplacer(
	"__DIEZE__", "#",
	"__PERCENT__", "%",
	"__PTVIRG__", ";",
	"__DBLQUO__", `"`,
	"__QUOTE__", "'",
	"__PIPE__", "|",
	"__EGAL__", "=",
	"__TAB__", "\t",
)

// ParseFile reads a .mxtsessions or MobaXterm.ini file.
func ParseFile(path string) (Result, error) {
	data, err := importfile.Read(path, importfile.MaxSize)
	if err != nil {
		return Result{Path: path}, err
	}
	res := Parse(bytes.NewReader(decode(data)))
	res.Path = path
	return res, nil
}

// decode returns UTF-8 text. MobaXterm writes files in the Windows ANSI code
// page (e.g. cp1251 for Cyrillic), not UTF-8.
func decode(data []byte) []byte {
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
	if utf8.Valid(data) {
		return data
	}
	cm := charmap.Windows1252
	switch ansiCodePage() {
	case 1250:
		cm = charmap.Windows1250
	case 1251:
		cm = charmap.Windows1251
	case 1253:
		cm = charmap.Windows1253
	case 1254:
		cm = charmap.Windows1254
	case 1255:
		cm = charmap.Windows1255
	case 1256:
		cm = charmap.Windows1256
	case 1257:
		cm = charmap.Windows1257
	case 1258:
		cm = charmap.Windows1258
	}
	out, err := cm.NewDecoder().Bytes(data)
	if err != nil {
		return data
	}
	return out
}

// Parse reads sessions from UTF-8 text.
func Parse(r io.Reader) Result {
	res := Result{Sessions: []Session{}, Skipped: map[string]int{}}
	inBookmarks := false
	var folder []string

	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 1<<20), 1<<20)
	for sc.Scan() {
		line := strings.TrimRight(sc.Text(), "\r")
		if strings.HasPrefix(line, "[") {
			name := strings.Trim(line, "[] ")
			inBookmarks = name == "Bookmarks" || strings.HasPrefix(name, "Bookmarks_")
			folder = nil
			continue
		}
		if !inBookmarks {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		switch key {
		case "SubRep":
			folder = splitFolder(value)
			continue
		case "ImgNum":
			continue
		}
		if s, typ, ok := parseSession(unescaper.Replace(key), value); ok {
			s.Folder = folder
			res.Sessions = append(res.Sessions, s)
		} else if typ != "" {
			res.Skipped[typ]++
		}
	}
	return res
}

func splitFolder(v string) []string {
	var out []string
	for _, p := range strings.Split(v, `\`) {
		if p = strings.TrimSpace(unescaper.Replace(p)); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func parseSession(name, value string) (Session, string, bool) {
	parts := strings.Split(value, "#")
	if len(parts) < 3 {
		return Session{}, "", false
	}
	f := strings.Split(parts[2], "%")
	field := func(i int) string {
		if i < len(f) {
			return strings.TrimSpace(unescaper.Replace(f[i]))
		}
		return ""
	}
	typ := field(0)
	typeName := typeNames[typ]
	if typeName == "" {
		typeName = "type " + typ
	}

	s := Session{Name: name, Host: field(1), User: field(3)}
	switch typ {
	case "0", "7": // SSH, SFTP: both become SSH hosts
		s.Kind = "ssh"
		s.Port = port(field(2), 22)
		s.KeyFile = keyPath(field(14))
		if gw := field(7); gw != "" {
			s.Gateway = gw
			if u := field(9); u != "" {
				s.Gateway = u + "@" + gw
			}
			if p := field(8); p != "" && p != "22" {
				s.Gateway += ":" + p
			}
		}
	case "4":
		s.Kind = "rdp"
		s.Port = port(field(2), 3389)
	default:
		return Session{}, typeName, false
	}
	if s.Host == "" {
		return Session{}, typeName, false
	}
	return s, typeName, true
}

func port(v string, def int) int {
	if n, err := strconv.Atoi(v); err == nil && n > 0 && n < 65536 {
		return n
	}
	return def
}

// keyPath expands MobaXterm's path placeholders. A ".pub" path (a common
// mistake in MobaXterm) is turned into the matching private key.
func keyPath(p string) string {
	if p == "" {
		return ""
	}
	home, _ := os.UserHomeDir()
	repl := strings.NewReplacer(
		"_ProfileDir_", home,
		"_MyDocuments_", filepath.Join(home, "Documents"),
		"_Desktop_", filepath.Join(home, "Desktop"),
		"_AppDataDir_", os.Getenv("APPDATA"),
		"_CurrentDrive_", currentDrive(),
	)
	p = repl.Replace(p)
	if filepath.Separator != '\\' {
		// Sessions exported on Windows use backslashes.
		p = strings.ReplaceAll(p, `\`, "/")
	}
	if strings.HasSuffix(strings.ToLower(p), ".pub") {
		if priv := p[:len(p)-4]; fileExists(priv) || !fileExists(p) {
			p = priv
		}
	}
	return filepath.Clean(p)
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

func currentDrive() string {
	if d := os.Getenv("SystemDrive"); len(d) >= 1 {
		return strings.TrimSuffix(d, ":")
	}
	return "C"
}

// DefaultPaths lists where MobaXterm keeps its configuration, most likely
// first; only existing files are returned.
func DefaultPaths() []string {
	var candidates []string
	if p := lastIniPath(); p != "" {
		candidates = append(candidates, p)
	}
	if ad := os.Getenv("APPDATA"); ad != "" {
		candidates = append(candidates, filepath.Join(ad, "MobaXterm", "MobaXterm.ini"))
	}
	if home, err := os.UserHomeDir(); err == nil {
		candidates = append(candidates, filepath.Join(home, "Documents", "MobaXterm", "MobaXterm.ini"))
	}
	seen := map[string]bool{}
	var out []string
	for _, c := range candidates {
		key := strings.ToLower(filepath.Clean(c))
		if !seen[key] && fileExists(c) {
			seen[key] = true
			out = append(out, c)
		}
	}
	return out
}
