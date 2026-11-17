package importers

import (
	"encoding/csv"
	"fmt"
	"path/filepath"
	"strconv"
	"strings"
)

// Termius keeps its local vault encrypted, so there is nothing to auto-detect.
// What it does produce is a CSV with one host per row (Groups, Label, Tags,
// Hostname/IP, Protocol, Port, Username, Password, SSH Key, ...). Columns are
// matched by header name, so reordered or trimmed exports work too, and the
// file is read the same way on Windows and macOS.

func init() {
	register(source{
		SourceInfo: SourceInfo{
			ID: "termius", Name: "Termius", Pick: "file",
			FilterName: "Termius CSV export", Filter: "*.csv",
			Hint: "Choose a CSV with your Termius hosts (columns such as Groups, Label, Hostname/IP, Port, Username, SSH Key).",
		},
		read: readTermius,
	})
}

func termiusColumn(h string) string {
	h = strings.ToLower(strings.TrimSpace(strings.TrimPrefix(h, "\ufeff")))
	h = strings.NewReplacer("_", " ", "-", " ").Replace(h)
	switch h {
	case "label", "name", "alias", "title":
		return "name"
	case "group", "groups", "folder", "parent group":
		return "group"
	case "hostname/ip", "hostname", "host", "address", "ip", "hostname ip", "host name", "host/ip":
		return "host"
	case "protocol", "type":
		return "proto"
	case "port", "ssh port":
		return "port"
	case "username", "user", "login", "ssh username":
		return "user"
	case "ssh key", "key", "identity file", "identity", "private key", "key file", "ssh key path":
		return "key"
	}
	return ""
}

func readTermius(paths []string) (Result, error) {
	res := Result{Path: paths[0], Skipped: map[string]int{}}
	text, err := readText(paths[0])
	if err != nil {
		return res, err
	}
	r := csv.NewReader(strings.NewReader(text))
	r.FieldsPerRecord = -1
	r.LazyQuotes = true
	r.TrimLeadingSpace = true
	rows, err := r.ReadAll()
	if err != nil {
		return res, err
	}
	if len(rows) == 0 {
		return res, nil
	}
	col := map[string]int{}
	for i, h := range rows[0] {
		if c := termiusColumn(h); c != "" {
			if _, dup := col[c]; !dup {
				col[c] = i
			}
		}
	}
	if _, ok := col["host"]; !ok {
		return res, fmt.Errorf("this doesn't look like a Termius hosts CSV: no Hostname/IP column")
	}
	get := func(row []string, c string) string {
		if i, ok := col[c]; ok && i < len(row) {
			return strings.TrimSpace(row[i])
		}
		return ""
	}
	for _, row := range rows[1:] {
		addr := get(row, "host")
		if addr == "" {
			continue
		}
		if p := strings.ToLower(get(row, "proto")); p != "" && p != "ssh" && p != "sftp" {
			res.Skipped[p]++
			continue
		}
		user := get(row, "user")
		addr, user = splitUserHost(addr, user)
		port := 22
		if p, err := strconv.Atoi(get(row, "port")); err == nil {
			port = cleanPort(p, 22)
		}
		h := Host{Name: get(row, "name"), Kind: "ssh", Host: addr, Port: port, User: user}
		if h.Name == "" {
			h.Name = addr
		}
		// Nested groups are written "Parent/Child" (a single field can also
		// list several comma-separated groups; the first one wins).
		if g := get(row, "group"); g != "" {
			g = strings.Split(g, ",")[0]
			for _, part := range strings.Split(strings.ReplaceAll(g, `\`, "/"), "/") {
				if part = strings.TrimSpace(part); part != "" {
					h.Folder = append(h.Folder, part)
				}
			}
		}
		if k := get(row, "key"); k != "" {
			// Only a path is usable; Termius key names refer to its own vault.
			if strings.ContainsAny(k, `/\`) || filepath.IsAbs(k) || strings.HasPrefix(k, "~") {
				h.KeyFile = expandKeyPath(k, "")
			} else {
				h.Warning = "key “" + k + "” is stored in Termius; choose the key file"
			}
		}
		res.Hosts = append(res.Hosts, h)
	}
	res.Notes = append(res.Notes, "Passwords aren’t imported; you’ll be asked once when connecting and can save them to the keychain.")
	return res, nil
}
