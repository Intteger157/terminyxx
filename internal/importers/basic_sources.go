package importers

import (
	"os/user"
	"path/filepath"
	"strings"

	"terminyxx/internal/mobaxterm"
	"terminyxx/internal/sshconfig"
)

func init() {
	register(source{
		SourceInfo: SourceInfo{
			ID: "openssh", Name: "OpenSSH config", Pick: "file",
			FilterName: "SSH config", Filter: "config;*.conf;*",
			Hint: "Reads ~/.ssh/config, including Include files.",
		},
		detect: func() string { return existing(sshconfig.DefaultPath()) },
		read:   readOpenSSH,
	})
	register(source{
		SourceInfo: SourceInfo{
			ID: "mobaxterm", Name: "MobaXterm", Pick: "file",
			FilterName: "MobaXterm sessions (*.mxtsessions, *.ini)", Filter: "*.mxtsessions;*.ini",
			Hint: "In MobaXterm, right-click User sessions → Export all sessions to file.",
		},
		detect: func() string {
			if p := mobaxterm.DefaultPaths(); len(p) > 0 {
				return p[0]
			}
			return ""
		},
		read: readMobaXterm,
	})
}

func defaultUser() string {
	u, err := user.Current()
	if err != nil {
		return ""
	}
	name := u.Username
	if i := strings.LastIndexAny(name, `\/`); i >= 0 {
		name = name[i+1:] // strip DOMAIN\ on Windows
	}
	return name
}

func readOpenSSH(paths []string) (Result, error) {
	var res Result
	res.Path = paths[0]
	hosts, err := sshconfig.ParseFile(paths[0])
	if err != nil {
		return res, err
	}
	def := defaultUser()
	alias := map[string]int{}
	for i, h := range hosts {
		alias[strings.ToLower(h.Alias)] = i
	}
	for _, h := range hosts {
		u := h.User
		if u == "" {
			u = def
		}
		host := Host{Name: h.Alias, Kind: "ssh", Host: h.HostName, Port: h.Port, User: u, KeyFile: h.IdentityFile}
		if h.ProxyJump != "" {
			host.Jump = parseHops(h.ProxyJump)
			if host.Jump == nil {
				host.Warning = "jump host not understood: " + h.ProxyJump
			}
			// A hop named like another Host block uses that block's settings.
			for k, hop := range host.Jump {
				if j, ok := alias[strings.ToLower(hop.Host)]; ok {
					host.Jump[k].Index = j
					if hop.Port == 22 && hosts[j].Port != 22 {
						host.Jump[k].Port = hosts[j].Port
					}
				} else if hop.User == "" {
					host.Jump[k].User = def
				}
			}
		}
		res.Hosts = append(res.Hosts, host)
	}
	return res, nil
}

func readMobaXterm(paths []string) (Result, error) {
	var res Result
	for _, p := range paths {
		m, err := mobaxterm.ParseFile(p)
		if err != nil {
			return res, err
		}
		for _, s := range m.Sessions {
			h := Host{Name: s.Name, Folder: s.Folder, Kind: s.Kind, Host: s.Host, Port: s.Port, User: s.User, KeyFile: s.KeyFile}
			if s.Gateway != "" {
				if hop, ok := parseHop(s.Gateway); ok {
					h.Jump = []Hop{hop}
				} else {
					h.Warning = "gateway not understood: " + s.Gateway
				}
			}
			res.Hosts = append(res.Hosts, h)
		}
		for t, n := range m.Skipped {
			if res.Skipped == nil {
				res.Skipped = map[string]int{}
			}
			res.Skipped[t] += n
		}
	}
	if len(paths) == 1 {
		res.Path = paths[0]
	}
	res.Notes = append(res.Notes, "MobaXterm encrypts saved passwords with its master password, so they can’t be imported; you’ll be asked once when connecting.")
	return res, nil
}

// expandKeyPath expands ~ and makes relative key paths absolute against base.
func expandKeyPath(p, base string) string {
	p = strings.TrimSpace(p)
	if p == "" {
		return ""
	}
	if p == "~" || strings.HasPrefix(p, "~/") || strings.HasPrefix(p, `~\`) {
		p = filepath.Join(home(), p[1:])
	} else if base != "" && !filepath.IsAbs(p) {
		p = filepath.Join(base, p)
	}
	return pubToPrivate(filepath.Clean(p))
}
