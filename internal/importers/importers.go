// Package importers reads saved hosts from other SSH/RDP clients into one
// common format. Each source can auto-detect its data on this machine
// and/or read a file or folder the user picks (e.g. an export copied from
// another computer).
package importers

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

// Host is one imported host. Kind is "ssh" or "rdp".
type Host struct {
	Name    string   `json:"name"`
	Folder  []string `json:"folder"`
	Kind    string   `json:"kind"`
	Host    string   `json:"host"`
	Port    int      `json:"port"`
	User    string   `json:"user"`
	KeyFile string   `json:"keyFile"`
	// Jump is the chain of jump hosts (ProxyJump, gateway), outermost first.
	Jump []Hop `json:"jump"`
	// ProxyCommand (OpenSSH) is run locally to reach the host.
	ProxyCommand string `json:"proxyCommand"`
	X11          bool   `json:"x11"`
	// Warning is shown next to the host, e.g. a jump host that can't be read.
	Warning string `json:"warning"`
	// jumpName is a jump host given by the name of another session.
	jumpName string
	// RDP only.
	Domain     string `json:"domain"`
	Width      int    `json:"width"`
	Height     int    `json:"height"`
	Fullscreen bool   `json:"fullscreen"`
}

type Result struct {
	Source  string         `json:"source"`
	Path    string         `json:"path"`
	Hosts   []Host         `json:"hosts"`
	Skipped map[string]int `json:"skipped"` // unsupported session type -> count
	Notes   []string       `json:"notes"`
}

// Pick says what the user can choose when nothing is detected (or to read
// an export instead): "file", "files", "folder" or "" (auto-detect only).
type SourceInfo struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Detected   string `json:"detected"`
	Pick       string `json:"pick"`
	FilterName string `json:"filterName"`
	Filter     string `json:"filter"`
	Hint       string `json:"hint"`
}

type source struct {
	SourceInfo
	// onlyOn limits the source to these GOOS values (nil = everywhere).
	onlyOn []string
	detect func() string
	read   func(paths []string) (Result, error)
}

const registryPrefix = "Registry: "

var sources []source

func register(s source) { sources = append(sources, s) }

func (s source) available() bool {
	if len(s.onlyOn) == 0 {
		return true
	}
	for _, os := range s.onlyOn {
		if os == runtime.GOOS {
			return true
		}
	}
	return false
}

// List returns the sources usable on this OS, detected ones first.
func List() []SourceInfo {
	var out []SourceInfo
	for _, s := range sources {
		if !s.available() {
			continue
		}
		info := s.SourceInfo
		if s.detect != nil {
			info.Detected = s.detect()
		}
		out = append(out, info)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Detected != "" && out[j].Detected == "" })
	return out
}

// Read reads source id from paths, or from its detected location when paths
// is empty.
func Read(id string, paths []string) (Result, error) {
	for _, s := range sources {
		if s.ID != id {
			continue
		}
		if len(paths) == 0 || (len(paths) == 1 && paths[0] == "") {
			loc := ""
			if s.detect != nil {
				loc = s.detect()
			}
			if loc == "" {
				return emptyResult(id), nil
			}
			paths = []string{loc}
		}
		res, err := s.read(paths)
		res.Source = id
		if res.Path == "" {
			res.Path = strings.Join(paths, ", ")
		}
		if res.Hosts == nil {
			res.Hosts = []Host{}
		}
		linkHops(&res)
		if res.Skipped == nil {
			res.Skipped = map[string]int{}
		}
		if res.Notes == nil {
			res.Notes = []string{}
		}
		return res, err
	}
	return emptyResult(id), fmt.Errorf("unknown import source %q", id)
}

func emptyResult(id string) Result {
	return Result{Source: id, Hosts: []Host{}, Skipped: map[string]int{}, Notes: []string{}}
}

// --- helpers shared by the parsers ---

func home() string {
	h, _ := os.UserHomeDir()
	return h
}

func existing(paths ...string) string {
	for _, p := range paths {
		if p == "" {
			continue
		}
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

// appData returns the per-user application data dir for this OS
// (%APPDATA%, ~/Library/Application Support, ~/.config).
func appData() string {
	switch runtime.GOOS {
	case "windows":
		return os.Getenv("APPDATA")
	case "darwin":
		return filepath.Join(home(), "Library", "Application Support")
	default:
		if x := os.Getenv("XDG_CONFIG_HOME"); x != "" {
			return x
		}
		return filepath.Join(home(), ".config")
	}
}

// readText reads a file as UTF-8, handling UTF-8/UTF-16 BOMs (Windows
// tools such as regedit and mstsc write UTF-16).
func readText(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return decodeText(data), nil
}

func decodeText(data []byte) string {
	switch {
	case bytes.HasPrefix(data, []byte{0xEF, 0xBB, 0xBF}):
		return string(data[3:])
	case bytes.HasPrefix(data, []byte{0xFF, 0xFE}):
		return utf16String(data[2:], false)
	case bytes.HasPrefix(data, []byte{0xFE, 0xFF}):
		return utf16String(data[2:], true)
	case len(data) >= 4 && data[1] == 0 && data[3] == 0 && data[0] != 0:
		return utf16String(data, false) // UTF-16 LE without BOM
	}
	if !utf8.Valid(data) {
		return decodeANSI(data)
	}
	return string(data)
}

func utf16String(b []byte, bigEndian bool) string {
	u := make([]uint16, len(b)/2)
	for i := range u {
		if bigEndian {
			u[i] = uint16(b[2*i])<<8 | uint16(b[2*i+1])
		} else {
			u[i] = uint16(b[2*i+1])<<8 | uint16(b[2*i])
		}
	}
	return string(utf16.Decode(u))
}

func splitLines(s string) []string {
	return strings.Split(strings.ReplaceAll(s, "\r\n", "\n"), "\n")
}

func cleanPort(p, def int) int {
	if p > 0 && p < 65536 {
		return p
	}
	return def
}

// splitUserHost handles "user@host" in a host field (PuTTY allows it).
func splitUserHost(host, user string) (string, string) {
	if i := strings.LastIndex(host, "@"); i > 0 && user == "" {
		return host[i+1:], host[:i]
	}
	return host, user
}

// pubToPrivate maps a public key path to its private key when it exists.
func pubToPrivate(p string) string {
	if strings.HasSuffix(strings.ToLower(p), ".pub") {
		if priv := p[:len(p)-4]; existing(priv) != "" || existing(p) == "" {
			return priv
		}
	}
	return p
}
