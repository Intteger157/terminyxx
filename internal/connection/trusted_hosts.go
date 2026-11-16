package connection

import (
	"bufio"
	"bytes"
	"crypto/hmac"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"os"
	"strings"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
)

// TrustedHost is one known_hosts entry, for the "Trusted hosts" manager.
type TrustedHost struct {
	// ID identifies the line (a hash of its content) for RemoveTrustedHost.
	ID          string   `json:"id"`
	Hosts       []string `json:"hosts"`
	Hashed      bool     `json:"hashed"`
	KeyType     string   `json:"keyType"`
	Fingerprint string   `json:"fingerprint"`
	Marker      string   `json:"marker"` // "", "@cert-authority" or "@revoked"
	// Source is "app" (Terminyxx's own file, editable) or "openssh"
	// (~/.ssh/known_hosts, read-only).
	Source string `json:"source"`
}

// ErrReadOnlyHost is returned when removing an entry of ~/.ssh/known_hosts,
// which the app never writes.
var ErrReadOnlyHost = errors.New("this key is in ~/.ssh/known_hosts, which Terminyxx doesn't change; edit it with ssh-keygen -R <host>")

func lineID(line string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(line)))
	return hex.EncodeToString(sum[:12])
}

func readTrusted(path, source string) ([]TrustedHost, error) {
	if path == "" {
		return nil, nil
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var out []TrustedHost
	sc := bufio.NewScanner(bytes.NewReader(data))
	sc.Buffer(make([]byte, 64*1024), 1024*1024)
	for sc.Scan() {
		line := sc.Text()
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		marker, hosts, key, _, _, err := ssh.ParseKnownHosts([]byte(trimmed))
		if err != nil {
			continue
		}
		t := TrustedHost{
			ID:          lineID(line),
			KeyType:     key.Type(),
			Fingerprint: ssh.FingerprintSHA256(key),
			Source:      source,
		}
		if marker != "" {
			t.Marker = "@" + marker
		}
		for _, h := range hosts {
			if strings.HasPrefix(h, "|1|") {
				t.Hashed = true
				continue
			}
			t.Hosts = append(t.Hosts, h)
		}
		out = append(out, t)
	}
	return out, sc.Err()
}

// List returns the entries of the app's known_hosts, then the user's.
func (s *HostKeyStore) List() ([]TrustedHost, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	app, err := readTrusted(s.appFile, "app")
	if err != nil {
		return nil, err
	}
	user, _ := readTrusted(s.userFile, "openssh")
	out := append([]TrustedHost{}, app...)
	return append(out, user...), nil
}

// Remove deletes one entry (by TrustedHost.ID) from the app's known_hosts.
func (s *HostKeyStore) Remove(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	removed, err := s.rewrite(func(line string) bool { return lineID(line) == id })
	if err != nil {
		return err
	}
	if removed == 0 {
		if user, _ := readTrusted(s.userFile, "openssh"); user != nil {
			for _, t := range user {
				if t.ID == id {
					return ErrReadOnlyHost
				}
			}
		}
		return errors.New("trusted host not found")
	}
	return nil
}

// replace drops the app's entries for host (not @cert-authority / @revoked
// lines) and trusts key instead.
func (s *HostKeyStore) replace(host string, key ssh.PublicKey) error {
	s.mu.Lock()
	norm := knownhosts.Normalize(host)
	_, err := s.rewrite(func(line string) bool {
		marker, hosts, _, _, _, err := ssh.ParseKnownHosts([]byte(strings.TrimSpace(line)))
		if err != nil || marker != "" {
			return false
		}
		for _, h := range hosts {
			if hostMatches(h, norm) {
				return true
			}
		}
		return false
	})
	s.mu.Unlock()
	if err != nil {
		return err
	}
	return s.add(host, key)
}

// rewrite removes the lines of the app file for which drop returns true.
// Callers hold s.mu.
func (s *HostKeyStore) rewrite(drop func(line string) bool) (int, error) {
	data, err := os.ReadFile(s.appFile)
	if errors.Is(err, os.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	lines := strings.SplitAfter(string(data), "\n")
	var b strings.Builder
	removed := 0
	for _, l := range lines {
		t := strings.TrimSpace(l)
		if t != "" && !strings.HasPrefix(t, "#") && drop(l) {
			removed++
			continue
		}
		b.WriteString(l)
	}
	if removed == 0 {
		return 0, nil
	}
	tmp := s.appFile + ".tmp"
	if err := os.WriteFile(tmp, []byte(b.String()), 0o600); err != nil {
		return 0, err
	}
	return removed, os.Rename(tmp, s.appFile)
}

// hostMatches reports whether a known_hosts host field (plain or
// "|1|salt|hash") names the normalized host. Wildcard patterns don't count:
// replacing a key never edits a pattern line.
func hostMatches(field, norm string) bool {
	if strings.HasPrefix(field, "|1|") {
		parts := strings.Split(field[3:], "|")
		if len(parts) != 2 {
			return false
		}
		salt, err1 := base64.StdEncoding.DecodeString(parts[0])
		want, err2 := base64.StdEncoding.DecodeString(parts[1])
		if err1 != nil || err2 != nil {
			return false
		}
		mac := hmac.New(sha1.New, salt)
		mac.Write([]byte(norm))
		return hmac.Equal(mac.Sum(nil), want)
	}
	return field == norm
}
