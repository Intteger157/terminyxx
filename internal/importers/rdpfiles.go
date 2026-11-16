package importers

import (
	"net"
	"path/filepath"
	"strconv"
	"strings"
)

// .rdp files (Windows Remote Desktop Connection, Microsoft Remote Desktop on
// macOS, Remote Desktop Manager exports) are "name:type:value" lines, often
// UTF-16 encoded.

func init() {
	register(source{
		SourceInfo: SourceInfo{
			ID: "rdpfiles", Name: "Remote Desktop (.rdp files)", Pick: "files",
			FilterName: "Remote Desktop files (*.rdp)", Filter: "*.rdp",
			Hint: "Choose one or more .rdp files saved from Remote Desktop Connection or Microsoft Remote Desktop.",
		},
		read: readRDPFiles,
	})
}

func readRDPFiles(paths []string) (Result, error) {
	var res Result
	for _, p := range paths {
		text, err := readText(p)
		if err != nil {
			return res, err
		}
		if h, ok := parseRDPFile(text); ok {
			h.Name = strings.TrimSuffix(filepath.Base(p), filepath.Ext(p))
			res.Hosts = append(res.Hosts, h)
		}
	}
	if len(paths) == 1 {
		res.Path = paths[0]
	}
	return res, nil
}

func parseRDPFile(text string) (Host, bool) {
	vals := map[string]string{}
	for _, line := range splitLines(text) {
		parts := strings.SplitN(strings.TrimSpace(line), ":", 3)
		if len(parts) == 3 {
			vals[strings.ToLower(parts[0])] = parts[2]
		}
	}
	addr := vals["full address"]
	if addr == "" {
		return Host{}, false
	}
	h := Host{Kind: "rdp", Host: addr, Port: 3389}
	if host, port, err := net.SplitHostPort(addr); err == nil {
		h.Host = host
		if n, err := strconv.Atoi(port); err == nil {
			h.Port = cleanPort(n, 3389)
		}
	}
	if n, err := strconv.Atoi(vals["server port"]); err == nil && h.Port == 3389 {
		h.Port = cleanPort(n, 3389)
	}
	user := vals["username"]
	if d, u, ok := strings.Cut(user, `\`); ok {
		h.Domain, user = d, u
	}
	h.User = user
	if d := vals["domain"]; d != "" && h.Domain == "" {
		h.Domain = d
	}
	h.Width, _ = strconv.Atoi(vals["desktopwidth"])
	h.Height, _ = strconv.Atoi(vals["desktopheight"])
	h.Fullscreen = vals["screen mode id"] == "2"
	return h, true
}
