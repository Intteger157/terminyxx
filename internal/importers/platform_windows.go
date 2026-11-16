//go:build windows

package importers

import (
	"fmt"
	"strconv"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
	"golang.org/x/text/encoding/charmap"
)

// regSessions reads HKCU\<path>\<session> keys into name -> value map.
// DWORD values are returned as decimal strings.
func regSessions(path string) (map[string]map[string]string, error) {
	root, err := registry.OpenKey(registry.CURRENT_USER, path, registry.ENUMERATE_SUB_KEYS)
	if err != nil {
		return nil, fmt.Errorf("open registry key %s: %w", path, err)
	}
	defer root.Close()
	names, err := root.ReadSubKeyNames(-1)
	if err != nil {
		return nil, err
	}
	out := map[string]map[string]string{}
	for _, name := range names {
		k, err := registry.OpenKey(root, name, registry.QUERY_VALUE)
		if err != nil {
			continue
		}
		vals := map[string]string{}
		valueNames, _ := k.ReadValueNames(-1)
		for _, vn := range valueNames {
			if s, _, err := k.GetStringValue(vn); err == nil {
				vals[vn] = s
			} else if n, _, err := k.GetIntegerValue(vn); err == nil {
				vals[vn] = strconv.FormatUint(n, 10)
			}
		}
		k.Close()
		out[name] = vals
	}
	return out, nil
}

func regKeyExists(path string) bool {
	k, err := registry.OpenKey(registry.CURRENT_USER, path, registry.ENUMERATE_SUB_KEYS)
	if err != nil {
		return false
	}
	defer k.Close()
	names, _ := k.ReadSubKeyNames(-1)
	return len(names) > 0
}

// decodeANSI decodes text in the system ANSI code page.
func decodeANSI(b []byte) string {
	cm := charmap.Windows1252
	switch windows.GetACP() {
	case 1250:
		cm = charmap.Windows1250
	case 1251:
		cm = charmap.Windows1251
	case 1253:
		cm = charmap.Windows1253
	case 1254:
		cm = charmap.Windows1254
	}
	if out, err := cm.NewDecoder().Bytes(b); err == nil {
		return string(out)
	}
	return string(b)
}
