package importers

import (
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// SecureCRT stores one session per .ini file under Config/Sessions; folders
// are directories. Lines look like:
//
//	S:"Hostname"=10.0.0.5
//	S:"Username"=deploy
//	D:"[SSH2] Port"=00000016        (hex)
//	S:"Protocol Name"=SSH2
//	S:"Identity Filename V2"=C:\keys\id_rsa
//	S:"Firewall Name"=Session:bastion

func init() {
	register(source{
		SourceInfo: SourceInfo{
			ID: "securecrt", Name: "SecureCRT", Pick: "folder",
			Hint: "Choose SecureCRT's Config\\Sessions folder (see Options → Global Options → Configuration Paths).",
		},
		detect: func() string {
			return existing(
				filepath.Join(os.Getenv("APPDATA"), "VanDyke", "Config", "Sessions"),
				filepath.Join(home(), "Library", "Application Support", "VanDyke", "SecureCRT", "Config", "Sessions"),
				filepath.Join(home(), ".vandyke", "SecureCRT", "Config", "Sessions"),
			)
		},
		read: readSecureCRT,
	})
}

func readSecureCRT(paths []string) (Result, error) {
	res := Result{Path: paths[0], Skipped: map[string]int{}}
	root := paths[0]
	if info, err := os.Stat(root); err == nil && !info.IsDir() {
		root = filepath.Dir(root)
	}
	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.EqualFold(filepath.Ext(p), ".ini") {
			return nil
		}
		base := strings.TrimSuffix(d.Name(), filepath.Ext(d.Name()))
		if strings.HasPrefix(base, "__") || base == "Default" {
			return nil // folder metadata and the default session template
		}
		text, err := readText(p)
		if err != nil {
			return nil
		}
		rel, _ := filepath.Rel(root, filepath.Dir(p))
		var folder []string
		if rel != "." {
			folder = strings.Split(filepath.ToSlash(rel), "/")
		}
		h, kind, ok := parseSecureCRT(text)
		if !ok {
			if kind != "" {
				res.Skipped[kind]++
			}
			return nil
		}
		h.Name, h.Folder = base, folder
		res.Hosts = append(res.Hosts, h)
		return nil
	})
	res.Notes = append(res.Notes, "SecureCRT saved passwords are encrypted and not imported.")
	return res, err
}

func parseSecureCRT(text string) (Host, string, bool) {
	vals := map[string]string{}
	for _, line := range splitLines(text) {
		line = strings.TrimSpace(line)
		if len(line) < 4 || line[1] != ':' || line[2] != '"' {
			continue
		}
		end := strings.Index(line[3:], `"=`)
		if end < 0 {
			continue
		}
		key := line[3 : 3+end]
		val := line[3+end+2:]
		if line[0] == 'D' {
			if n, err := strconv.ParseUint(val, 16, 32); err == nil {
				val = strconv.FormatUint(n, 10)
			}
		}
		vals[key] = val
	}

	proto := vals["Protocol Name"]
	switch strings.ToUpper(proto) {
	case "SSH2", "SSH1", "":
	default:
		return Host{}, proto, false
	}
	hostName := strings.TrimSpace(vals["Hostname"])
	if hostName == "" {
		return Host{}, "", false
	}
	port, _ := strconv.Atoi(vals["[SSH2] Port"])
	if port == 0 {
		port, _ = strconv.Atoi(vals["Port"])
	}
	key := vals["Identity Filename V2"]
	if i := strings.Index(key, "*"); i >= 0 {
		key = key[:i] // "path*options"
	}
	h := Host{
		Kind:    "ssh",
		Host:    hostName,
		Port:    cleanPort(port, 22),
		User:    strings.TrimSpace(vals["Username"]),
		KeyFile: expandKeyPath(key, ""),
	}
	if fw := strings.TrimPrefix(vals["Firewall Name"], "Session:"); fw != "" && !strings.EqualFold(fw, "None") {
		h.Warning = "via " + fw
	}
	return h, "", true
}
