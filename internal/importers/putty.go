package importers

import (
	"bufio"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// PuTTY and KiTTY keep sessions in the registry:
//
//	HKCU\Software\SimonTatham\PuTTY\Sessions\<url-encoded name>
//	  HostName, PortNumber (DWORD), UserName, Protocol, PublicKeyFile
//
// KiTTY uses the same layout plus a Folder value. A "regedit" export
// (.reg) of those keys can be imported on any OS.

const (
	puttyKey = `Software\SimonTatham\PuTTY\Sessions`
	kittyKey = `Software\9bis.com\KiTTY\Sessions`
)

func init() {
	register(source{
		SourceInfo: SourceInfo{
			ID: "putty", Name: "PuTTY", Pick: "file",
			FilterName: "Registry export (*.reg)", Filter: "*.reg",
			Hint: "On Windows, sessions are read from the registry. Elsewhere, export HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions with regedit and choose the .reg file.",
		},
		detect: func() string {
			if regKeyExists(puttyKey) {
				return registryPrefix + `HKCU\` + puttyKey
			}
			return ""
		},
		read: func(paths []string) (Result, error) { return readPuTTYLike(paths, puttyKey) },
	})
	register(source{
		SourceInfo: SourceInfo{
			ID: "kitty", Name: "KiTTY", Pick: "file",
			FilterName: "Registry export (*.reg)", Filter: "*.reg",
			Hint: "Sessions are read from the registry, or from a .reg export.",
		},
		onlyOn: []string{"windows"},
		detect: func() string {
			if regKeyExists(kittyKey) {
				return registryPrefix + `HKCU\` + kittyKey
			}
			return ""
		},
		read: func(paths []string) (Result, error) { return readPuTTYLike(paths, kittyKey) },
	})
}

func readPuTTYLike(paths []string, key string) (Result, error) {
	var res Result
	sessions := map[string]map[string]string{}
	for _, p := range paths {
		var got map[string]map[string]string
		var err error
		if strings.HasPrefix(p, registryPrefix) {
			got, err = regSessions(key)
		} else {
			got, err = parseRegFile(p, key)
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
	res.Hosts, res.Skipped = puttySessions(sessions)
	for _, h := range res.Hosts {
		if strings.HasSuffix(strings.ToLower(h.KeyFile), ".ppk") {
			res.Notes = append(res.Notes, "PuTTY .ppk keys are supported directly.")
			break
		}
	}
	return res, nil
}

func puttySessions(sessions map[string]map[string]string) ([]Host, map[string]int) {
	skipped := map[string]int{}
	names := make([]string, 0, len(sessions))
	for n := range sessions {
		names = append(names, n)
	}
	sort.Strings(names)

	var hosts []Host
	for _, raw := range names {
		v := sessions[raw]
		name := puttyUnescape(raw)
		if name == "Default Settings" {
			continue
		}
		proto := strings.ToLower(v["Protocol"])
		if proto == "" {
			proto = "ssh"
		}
		if proto != "ssh" {
			skipped[strings.ToUpper(proto[:1])+proto[1:]]++
			continue
		}
		hostName, user := splitUserHost(strings.TrimSpace(v["HostName"]), strings.TrimSpace(v["UserName"]))
		if hostName == "" {
			continue
		}
		port, _ := strconv.Atoi(v["PortNumber"])
		h := Host{
			Name:    name,
			Kind:    "ssh",
			Host:    hostName,
			Port:    cleanPort(port, 22),
			User:    user,
			KeyFile: pubToPrivate(strings.TrimSpace(v["PublicKeyFile"])),
		}
		if f := strings.Trim(v["Folder"], `\/ `); f != "" && f != "Default" {
			h.Folder = strings.FieldsFunc(f, func(r rune) bool { return r == '\\' || r == '/' })
		}
		hosts = append(hosts, h)
	}
	return hosts, skipped
}

// PuTTY escapes session names like URLs ("My%20Server").
func puttyUnescape(s string) string {
	if u, err := url.PathUnescape(s); err == nil {
		return u
	}
	return s
}

var regValueRe = regexp.MustCompile(`^"((?:[^"\\]|\\.)*)"=(.*)$`)

// parseRegFile reads a regedit export, keeping keys directly under
// HKEY_CURRENT_USER\<key>\.
func parseRegFile(path, key string) (map[string]map[string]string, error) {
	text, err := readText(path)
	if err != nil {
		return nil, err
	}
	out := map[string]map[string]string{}
	prefix := strings.ToLower(`HKEY_CURRENT_USER\` + key + `\`)
	var cur map[string]string
	sc := bufio.NewScanner(strings.NewReader(text))
	sc.Buffer(make([]byte, 1<<20), 1<<20)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if strings.HasPrefix(line, "[") {
			k := strings.Trim(line, "[]")
			cur = nil
			if strings.HasPrefix(strings.ToLower(k), prefix) {
				name := k[len(prefix):]
				if !strings.Contains(name, `\`) {
					cur = map[string]string{}
					out[name] = cur
				}
			}
			continue
		}
		if cur == nil {
			continue
		}
		m := regValueRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		name, val := m[1], m[2]
		switch {
		case strings.HasPrefix(val, `"`):
			s := strings.TrimSuffix(strings.TrimPrefix(val, `"`), `"`)
			cur[name] = strings.NewReplacer(`\\`, `\`, `\"`, `"`).Replace(s)
		case strings.HasPrefix(val, "dword:"):
			if n, err := strconv.ParseUint(strings.TrimPrefix(val, "dword:"), 16, 32); err == nil {
				cur[name] = strconv.FormatUint(n, 10)
			}
		}
	}
	return out, sc.Err()
}
