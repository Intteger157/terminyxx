package importers

import (
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// Tabby (formerly Terminus) keeps profiles in config.yaml:
//
//	groups: [{id: 1a2b, name: Production}]
//	profiles:
//	  - type: ssh
//	    name: web-01
//	    group: 1a2b          # group id (or a plain name in older versions)
//	    options: {host: 10.0.0.5, port: 22, user: deploy,
//	              privateKeys: ['file:///C:/Users/me/.ssh/id_ed25519'], jumpHost: <profile id>}

func init() {
	register(source{
		SourceInfo: SourceInfo{
			ID: "tabby", Name: "Tabby", Pick: "file",
			FilterName: "Tabby config (config.yaml)", Filter: "*.yaml;*.yml",
			Hint: "Choose Tabby's config.yaml (Settings → Config file → Show config file).",
		},
		detect: func() string { return existing(filepath.Join(appData(), "tabby", "config.yaml")) },
		read:   readTabby,
	})
}

type tabbyConfig struct {
	Groups []struct {
		ID   string `yaml:"id"`
		Name string `yaml:"name"`
	} `yaml:"groups"`
	Profiles []struct {
		ID      string `yaml:"id"`
		Type    string `yaml:"type"`
		Name    string `yaml:"name"`
		Group   string `yaml:"group"`
		Options struct {
			Host        string   `yaml:"host"`
			Port        int      `yaml:"port"`
			User        string   `yaml:"user"`
			PrivateKeys []string `yaml:"privateKeys"`
			JumpHost    string   `yaml:"jumpHost"`
			// RDP-like profiles don't exist in Tabby; only ssh is imported.
		} `yaml:"options"`
	} `yaml:"profiles"`
}

func readTabby(paths []string) (Result, error) {
	res := Result{Path: paths[0], Skipped: map[string]int{}}
	data, err := os.ReadFile(paths[0])
	if err != nil {
		return res, err
	}
	var cfg tabbyConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return res, err
	}
	groups := map[string]string{}
	for _, g := range cfg.Groups {
		groups[g.ID] = g.Name
	}
	names := map[string]string{}
	for _, p := range cfg.Profiles {
		names[p.ID] = p.Name
	}
	for _, p := range cfg.Profiles {
		if p.Type != "ssh" {
			if p.Type != "" && p.Type != "local" {
				res.Skipped[p.Type]++
			}
			continue
		}
		if p.Options.Host == "" {
			continue
		}
		h := Host{Name: p.Name, Kind: "ssh", Host: p.Options.Host, Port: cleanPort(p.Options.Port, 22), User: p.Options.User}
		if h.Name == "" {
			h.Name = p.Options.Host
		}
		if g := p.Group; g != "" {
			if n, ok := groups[g]; ok {
				g = n
			}
			h.Folder = []string{g}
		}
		if len(p.Options.PrivateKeys) > 0 {
			h.KeyFile = tabbyKeyPath(p.Options.PrivateKeys[0])
		}
		if j := p.Options.JumpHost; j != "" {
			if n, ok := names[j]; ok {
				j = n
			}
			h.Warning = "via " + j
		}
		res.Hosts = append(res.Hosts, h)
	}
	return res, nil
}

// Tabby stores keys as file:// URLs (or plain paths in old versions).
func tabbyKeyPath(s string) string {
	if strings.HasPrefix(s, "file://") {
		if u, err := url.Parse(s); err == nil {
			p := u.Path
			if len(p) > 2 && p[0] == '/' && p[2] == ':' { // /C:/Users/...
				p = p[1:]
			}
			return expandKeyPath(filepath.FromSlash(p), "")
		}
	}
	return expandKeyPath(s, "")
}
