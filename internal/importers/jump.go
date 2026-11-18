package importers

import (
	"net"
	"strconv"
	"strings"
)

// Hop is one jump host, in connection order (outermost first). Index points
// at another host of the same result, or is -1 when the hop is only an
// address (the UI then reuses a saved host with that address or creates one).
type Hop struct {
	Index int    `json:"index"`
	Host  string `json:"host"`
	Port  int    `json:"port"`
	User  string `json:"user"`
}

// parseHop reads [ssh://][user@]host[:port] (IPv6 in brackets).
func parseHop(spec string) (Hop, bool) {
	s := strings.TrimSpace(spec)
	s = strings.TrimPrefix(s, "ssh://")
	s = strings.TrimSuffix(s, "/")
	h := Hop{Index: -1, Port: 22}
	if i := strings.LastIndex(s, "@"); i >= 0 {
		h.User, s = s[:i], s[i+1:]
	}
	switch {
	case strings.HasPrefix(s, "["):
		host, port, err := net.SplitHostPort(s)
		if err != nil {
			host = strings.Trim(s, "[]")
			port = ""
		}
		s = host
		if port != "" {
			p, err := strconv.Atoi(port)
			if err != nil || p <= 0 || p > 65535 {
				return Hop{}, false
			}
			h.Port = p
		}
	case strings.Count(s, ":") == 1:
		i := strings.Index(s, ":")
		p, err := strconv.Atoi(s[i+1:])
		if err != nil || p <= 0 || p > 65535 {
			return Hop{}, false
		}
		s, h.Port = s[:i], p
	}
	if s == "" || strings.ContainsAny(s, " \t,/") {
		return Hop{}, false
	}
	h.Host = s
	return h, true
}

// parseHops reads a comma-separated ProxyJump list.
func parseHops(spec string) []Hop {
	var out []Hop
	for _, part := range strings.Split(spec, ",") {
		if strings.TrimSpace(part) == "" {
			continue
		}
		h, ok := parseHop(part)
		if !ok {
			return nil // one unreadable hop makes the whole chain unusable
		}
		out = append(out, h)
	}
	return out
}

// linkHops points address-only hops at an imported host with the same
// address, and fills a linked hop's address from its host.
func linkHops(res *Result) {
	for i := range res.Hosts {
		if name := res.Hosts[i].jumpName; name != "" && len(res.Hosts[i].Jump) == 0 {
			found := false
			for j, o := range res.Hosts {
				full := strings.Join(append(append([]string{}, o.Folder...), o.Name), "/")
				if j != i && o.Kind == "ssh" && (strings.EqualFold(o.Name, name) || strings.EqualFold(full, strings.ReplaceAll(name, `\`, "/"))) {
					res.Hosts[i].Jump = []Hop{{Index: j}}
					found = true
					break
				}
			}
			if !found {
				res.Hosts[i].Warning = "jump host “" + name + "” not found"
			}
		}
		for k := range res.Hosts[i].Jump {
			hop := &res.Hosts[i].Jump[k]
			if hop.Index < 0 {
				for j, o := range res.Hosts {
					if j != i && o.Kind == "ssh" && strings.EqualFold(o.Host, hop.Host) && o.Port == hop.Port && (hop.User == "" || hop.User == o.User) {
						hop.Index = j
						break
					}
				}
			}
			if hop.Index >= 0 && hop.Index < len(res.Hosts) {
				o := res.Hosts[hop.Index]
				hop.Host, hop.Port = o.Host, o.Port
				if hop.User == "" {
					hop.User = o.User
				}
			} else {
				hop.Index = -1
			}
		}
	}
}
