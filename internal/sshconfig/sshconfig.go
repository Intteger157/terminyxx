// Package sshconfig reads the host entries of an OpenSSH client config
// (~/.ssh/config) so they can be imported as saved hosts.
package sshconfig

import (
	"bufio"
	"io"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
)

// Host is the effective configuration for one concrete Host alias.
type Host struct {
	Alias        string `json:"alias"`
	HostName     string `json:"hostName"`
	User         string `json:"user"`
	Port         int    `json:"port"`
	IdentityFile string `json:"identityFile"`
	ProxyJump    string `json:"proxyJump"`
	ProxyCommand string `json:"proxyCommand"`
	ForwardX11   bool   `json:"forwardX11"`
}

type block struct {
	patterns []string
	opts     map[string]string // first value wins, as in OpenSSH
}

// ParseFile reads path (following Include directives) and returns the
// concrete hosts it defines, in file order.
func ParseFile(p string) ([]Host, error) {
	blocks, err := readBlocks(p, filepath.Dir(p), 0)
	if err != nil {
		return nil, err
	}
	return resolve(blocks), nil
}

// Parse reads config text (Include directives are ignored).
func Parse(r io.Reader) ([]Host, error) {
	blocks, err := parse(r, "", 0)
	if err != nil {
		return nil, err
	}
	return resolve(blocks), nil
}

func readBlocks(p, baseDir string, depth int) ([]block, error) {
	f, err := os.Open(p)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return parse(f, baseDir, depth)
}

func parse(r io.Reader, baseDir string, depth int) ([]block, error) {
	// Options before the first Host apply to every host.
	blocks := []block{{patterns: []string{"*"}, opts: map[string]string{}}}
	cur := &blocks[0]
	skipping := false // inside a Match block, which we don't evaluate

	sc := bufio.NewScanner(r)
	for sc.Scan() {
		key, value := splitLine(sc.Text())
		if key == "" {
			continue
		}
		switch key {
		case "host":
			blocks = append(blocks, block{patterns: strings.Fields(value), opts: map[string]string{}})
			cur = &blocks[len(blocks)-1]
			skipping = false
			continue
		case "match":
			skipping = true
			continue
		case "include":
			if baseDir == "" || depth > 8 {
				continue
			}
			for _, pat := range strings.Fields(value) {
				pat = expandHome(pat)
				if !filepath.IsAbs(pat) {
					pat = filepath.Join(baseDir, pat)
				}
				matches, _ := filepath.Glob(pat)
				for _, m := range matches {
					inc, err := readBlocks(m, baseDir, depth+1)
					if err != nil {
						continue
					}
					// Included "global" options belong to the current block.
					for k, v := range inc[0].opts {
						if _, ok := cur.opts[k]; !ok {
							cur.opts[k] = v
						}
					}
					blocks = append(blocks, inc[1:]...)
					cur = &blocks[len(blocks)-1]
				}
			}
			continue
		}
		if skipping {
			continue
		}
		if _, ok := cur.opts[key]; !ok {
			cur.opts[key] = value
		}
	}
	return blocks, sc.Err()
}

func splitLine(line string) (string, string) {
	line = strings.TrimSpace(line)
	if line == "" || strings.HasPrefix(line, "#") {
		return "", ""
	}
	i := strings.IndexAny(line, " \t=")
	if i < 0 {
		return strings.ToLower(line), ""
	}
	key := strings.ToLower(line[:i])
	value := strings.TrimSpace(strings.TrimLeft(strings.TrimSpace(line[i:]), "="))
	value = strings.Trim(value, `"`)
	return key, value
}

func isPattern(s string) bool { return strings.ContainsAny(s, "*?!") }

func matches(patterns []string, alias string) bool {
	matched := false
	for _, p := range patterns {
		neg := strings.HasPrefix(p, "!")
		p = strings.TrimPrefix(p, "!")
		ok, _ := path.Match(strings.ToLower(p), strings.ToLower(alias))
		if ok && neg {
			return false
		}
		if ok {
			matched = true
		}
	}
	return matched
}

func resolve(blocks []block) []Host {
	var hosts []Host
	seen := map[string]bool{}
	for _, b := range blocks[1:] {
		for _, alias := range b.patterns {
			if isPattern(alias) || seen[alias] {
				continue
			}
			seen[alias] = true
			eff := map[string]string{}
			for _, other := range blocks {
				if !matches(other.patterns, alias) {
					continue
				}
				for k, v := range other.opts {
					if _, ok := eff[k]; !ok {
						eff[k] = v
					}
				}
			}
			h := Host{
				Alias:        alias,
				HostName:     eff["hostname"],
				User:         eff["user"],
				Port:         22,
				IdentityFile: expandHome(eff["identityfile"]),
				ProxyJump:    eff["proxyjump"],
				ProxyCommand: eff["proxycommand"],
				ForwardX11:   strings.EqualFold(eff["forwardx11"], "yes"),
			}
			if strings.EqualFold(h.ProxyCommand, "none") {
				h.ProxyCommand = ""
			}
			if h.HostName == "" {
				h.HostName = alias
			}
			h.HostName = strings.ReplaceAll(h.HostName, "%h", alias)
			if p, err := strconv.Atoi(eff["port"]); err == nil && p > 0 && p < 65536 {
				h.Port = p
			}
			if strings.EqualFold(h.ProxyJump, "none") {
				h.ProxyJump = ""
			}
			hosts = append(hosts, h)
		}
	}
	return hosts
}

func expandHome(p string) string {
	if p == "~" || strings.HasPrefix(p, "~/") || strings.HasPrefix(p, `~\`) {
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, p[1:])
		}
	}
	return p
}

// DefaultPath is ~/.ssh/config.
func DefaultPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".ssh", "config")
}
