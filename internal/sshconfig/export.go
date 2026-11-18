package sshconfig

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// ExportHost is one saved host written as a Host block.
type ExportHost struct {
	ID           string
	Name         string
	HostName     string
	User         string
	Port         int
	IdentityFile string
	// JumpID is another ExportHost's ID (written as ProxyJump <its alias>).
	JumpID       string
	ProxyCommand string
	ForwardAgent bool
	ForwardX11   bool
	// Forwards are "L|R|D bind:port dest:port" lines (dest empty for D).
	LocalForwards   []string
	RemoteForwards  []string
	DynamicForwards []string
}

var aliasBad = regexp.MustCompile(`[^A-Za-z0-9._@-]+`)

// Alias turns a host name into a Host pattern without spaces or wildcards.
func Alias(name string) string {
	a := strings.Trim(aliasBad.ReplaceAllString(strings.TrimSpace(name), "-"), "-")
	if a == "" {
		a = "host"
	}
	return a
}

// quote wraps values with spaces in double quotes.
func quote(v string) string {
	if strings.ContainsAny(v, " \t") {
		return `"` + strings.ReplaceAll(v, `"`, ``) + `"`
	}
	return v
}

// Export writes hosts in ~/.ssh/config format. Jump hosts must be in the
// list too (the caller adds the chain); a missing one is left out with a
// comment.
func Export(hosts []ExportHost, header string) string {
	aliases := map[string]string{}
	used := map[string]bool{}
	for _, h := range hosts {
		base := Alias(h.Name)
		a := base
		for i := 2; used[strings.ToLower(a)]; i++ {
			a = base + "-" + strconv.Itoa(i)
		}
		used[strings.ToLower(a)] = true
		aliases[h.ID] = a
	}

	var b strings.Builder
	if header != "" {
		for _, line := range strings.Split(header, "\n") {
			b.WriteString("# " + line + "\n")
		}
		b.WriteString("\n")
	}
	for i, h := range hosts {
		if i > 0 {
			b.WriteString("\n")
		}
		fmt.Fprintf(&b, "Host %s\n", aliases[h.ID])
		line := func(k, v string) { fmt.Fprintf(&b, "    %s %s\n", k, v) }
		line("HostName", h.HostName)
		if h.User != "" {
			line("User", quote(h.User))
		}
		if h.Port != 0 && h.Port != 22 {
			line("Port", strconv.Itoa(h.Port))
		}
		if h.IdentityFile != "" {
			line("IdentityFile", quote(h.IdentityFile))
			line("IdentitiesOnly", "yes")
		}
		if h.JumpID != "" {
			if a, ok := aliases[h.JumpID]; ok {
				line("ProxyJump", a)
			} else {
				b.WriteString("    # jump host not exported\n")
			}
		} else if h.ProxyCommand != "" {
			line("ProxyCommand", h.ProxyCommand)
		}
		if h.ForwardAgent {
			line("ForwardAgent", "yes")
		}
		if h.ForwardX11 {
			line("ForwardX11", "yes")
		}
		for _, f := range h.LocalForwards {
			line("LocalForward", f)
		}
		for _, f := range h.RemoteForwards {
			line("RemoteForward", f)
		}
		for _, f := range h.DynamicForwards {
			line("DynamicForward", f)
		}
	}
	return b.String()
}
