//go:build !windows

package importers

import (
	"errors"

	"golang.org/x/text/encoding/charmap"
)

func regSessions(string) (map[string]map[string]string, error) {
	return nil, errors.New("the Windows registry is not available on this system")
}

func regKeyExists(string) bool { return false }

// decodeANSI assumes Western Windows text for files copied from Windows.
func decodeANSI(b []byte) string {
	if out, err := charmap.Windows1252.NewDecoder().Bytes(b); err == nil {
		return string(out)
	}
	return string(b)
}
