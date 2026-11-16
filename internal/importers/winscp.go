package importers

import (
	"bufio"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

// WinSCP keeps sessions in HKCU\Software\Martin Prikryl\WinSCP 2\Sessions
// or in WinSCP.ini ([Sessions\<name>] sections). Names are %XX-escaped and
// use "/" for folders; string values are %XX-escaped too.

const winscpKey = `Software\Martin Prikryl\WinSCP 2\Sessions`

func init() {
	register(source{
		SourceInfo: SourceInfo{
			ID: "winscp", Name: "WinSCP", Pick: "file",
			FilterName: "WinSCP configuration (WinSCP.ini)", Filter: "*.ini",
			Hint: "On Windows, sessions are read from the registry or WinSCP.ini. Elsewhere, choose an exported WinSCP.ini (Tools → Export/Backup Configuration).",
		},
		detect: func() string {
			if regKeyExists(winscpKey) {
				return registryPrefix + `HKCU\` + winscpKey
			}
			return existing(filepath.Join(os.Getenv("APPDATA"), "WinSCP.ini"))
		},
		read: readWinSCP,
	})
}

func readWinSCP(paths []string) (Result, error) {
	var res Result
	sessions := map[string]map[string]string{}
	for _, p := range paths {
		var got map[string]map[string]string
		var err error
		if strings.HasPrefix(p, registryPrefix) {
			got, err = regSessions(winscpKey)
		} else {
			got, err = parseWinSCPIni(p)
		}
		if err != nil {
			return res, err
		}
		for k, v := range got {
			sessions[k] = v
		}
	}
	if len(paths) == 1 {
		res.Path = paths[0]
	}
	res.Hosts, res.Skipped = winscpSessions(sessions)
	res.Notes = append(res.Notes, "WinSCP saved passwords are not imported; you’ll be asked once when connecting.")
	return res, nil
}

// WinSCP FSProtocol values. The default (no value) is SFTP.
var winscpProtocols = map[string]string{
	"0": "", "1": "", "2": "", // SCP, SFTP (SCP fallback), SFTP
	"5": "FTP", "6": "WebDAV", "7": "S3",
}

func winscpSessions(sessions map[string]map[string]string) ([]Host, map[string]int) {
	skipped := map[string]int{}
	names := make([]string, 0, len(sessions))
	for n := range sessions {
		names = append(names, n)
	}
	sort.Strings(names)

	var hosts []Host
	for _, raw := range names {
		v := sessions[raw]
		full := winscpUnescape(raw)
		if full == "Default Settings" || v["HostName"] == "" {
			continue
		}
		if other, ok := winscpProtocols[v["FSProtocol"]]; ok && other != "" {
			skipped[other]++
			continue
		}
		parts := strings.Split(full, "/")
		port, _ := strconv.Atoi(v["PortNumber"])
		hostName, user := splitUserHost(winscpUnescape(v["HostName"]), winscpUnescape(v["UserName"]))
		h := Host{
			Name:    parts[len(parts)-1],
			Folder:  parts[:len(parts)-1],
			Kind:    "ssh",
			Host:    hostName,
			Port:    cleanPort(port, 22),
			User:    user,
			KeyFile: pubToPrivate(winscpUnescape(v["PublicKeyFile"])),
		}
		if v["Tunnel"] == "1" && v["TunnelHostName"] != "" {
			gw := winscpUnescape(v["TunnelHostName"])
			if u := winscpUnescape(v["TunnelUserName"]); u != "" {
				gw = u + "@" + gw
			}
			h.Warning = "via " + gw
		}
		hosts = append(hosts, h)
	}
	return hosts, skipped
}

// winscpUnescape decodes %XX sequences as UTF-8 bytes (WinSCP's escaping).
func winscpUnescape(s string) string {
	if !strings.Contains(s, "%") {
		return s
	}
	b := []byte{}
	for i := 0; i < len(s); i++ {
		if s[i] == '%' && i+2 < len(s) && isHex(s[i+1]) && isHex(s[i+2]) {
			n, _ := strconv.ParseUint(s[i+1:i+3], 16, 8)
			b = append(b, byte(n))
			i += 2
			continue
		}
		b = append(b, s[i])
	}
	return string(b)
}

func parseWinSCPIni(path string) (map[string]map[string]string, error) {
	text, err := readText(path)
	if err != nil {
		return nil, err
	}
	out := map[string]map[string]string{}
	var cur map[string]string
	sc := bufio.NewScanner(strings.NewReader(text))
	sc.Buffer(make([]byte, 1<<20), 1<<20)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if strings.HasPrefix(line, "[") {
			sec := strings.Trim(line, "[]")
			cur = nil
			if name, ok := strings.CutPrefix(sec, `Sessions\`); ok {
				cur = map[string]string{}
				out[name] = cur
			}
			continue
		}
		if cur == nil {
			continue
		}
		if k, v, ok := strings.Cut(line, "="); ok {
			cur[k] = v
		}
	}
	return out, sc.Err()
}

func isHex(c byte) bool {
	return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
}
