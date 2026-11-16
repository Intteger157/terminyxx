package connection

import (
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
)

// Host key errors reach the frontend as plain strings, so they use a
// machine-readable prefix: HOSTKEY_UNKNOWN|host|keyType|fingerprint, and for
// a changed key HOSTKEY_MISMATCH|host|keyType|fingerprint|known, where known
// lists the trusted keys as "type fingerprint" joined by ";".
const (
	HostKeyUnknownPrefix  = "HOSTKEY_UNKNOWN"
	HostKeyMismatchPrefix = "HOSTKEY_MISMATCH"
)

type HostKeyError struct {
	Mismatch    bool
	Host        string
	KeyType     string
	Fingerprint string
	// Known are the keys trusted for this host ("type fingerprint"), set
	// for a mismatch.
	Known []string
}

func (e *HostKeyError) Error() string {
	if e.Mismatch {
		return strings.Join([]string{HostKeyMismatchPrefix, e.Host, e.KeyType, e.Fingerprint, strings.Join(e.Known, ";")}, "|")
	}
	return strings.Join([]string{HostKeyUnknownPrefix, e.Host, e.KeyType, e.Fingerprint}, "|")
}

// HostKeyStore checks host keys against the app's own known_hosts file and,
// read-only, the user's OpenSSH known_hosts. New keys go to the app file.
type HostKeyStore struct {
	mu       sync.Mutex
	appFile  string
	userFile string
}

func NewHostKeyStore(appFile, userFile string) *HostKeyStore {
	return &HostKeyStore{appFile: appFile, userFile: userFile}
}

func DefaultUserKnownHosts() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".ssh", "known_hosts")
}

func (s *HostKeyStore) load() (ssh.HostKeyCallback, error) {
	if err := os.MkdirAll(filepath.Dir(s.appFile), 0o700); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(s.appFile, os.O_CREATE|os.O_RDONLY, 0o600)
	if err != nil {
		return nil, err
	}
	f.Close()

	files := []string{s.appFile}
	if s.userFile != "" {
		if _, err := os.Stat(s.userFile); err == nil {
			// Skip the user's file if it can't be parsed rather than failing.
			if _, err := knownhosts.New(s.userFile); err == nil {
				files = append(files, s.userFile)
			}
		}
	}
	return knownhosts.New(files...)
}

func (s *HostKeyStore) add(address string, key ssh.PublicKey) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	f, err := os.OpenFile(s.appFile, os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0o600)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = f.WriteString(knownhosts.Line([]string{knownhosts.Normalize(address)}, key) + "\n")
	return err
}

// Callback returns the host key callback for one connection attempt, plus
// the host key algorithms already known for addr so the server presents a
// key we can actually verify.
//
// acceptFingerprint is a key the user confirmed: an unknown key with that
// fingerprint is added to known_hosts. A changed key is always rejected
// unless replace is also set, in which case the app's old entries for the
// host are removed and the new key is saved.
func (s *HostKeyStore) Callback(addr, acceptFingerprint string, replace bool) (ssh.HostKeyCallback, []string, error) {
	check, err := s.load()
	if err != nil {
		return nil, nil, fmt.Errorf("known_hosts: %w", err)
	}

	cb := func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		err := check(hostname, remote, key)
		if err == nil {
			return nil
		}
		var keyErr *knownhosts.KeyError
		if !errors.As(err, &keyErr) {
			return err
		}
		fp := ssh.FingerprintSHA256(key)
		if len(keyErr.Want) > 0 {
			if replace && acceptFingerprint != "" && acceptFingerprint == fp {
				return s.replace(hostname, key)
			}
			known := make([]string, 0, len(keyErr.Want))
			for _, k := range keyErr.Want {
				known = append(known, k.Key.Type()+" "+ssh.FingerprintSHA256(k.Key))
			}
			return &HostKeyError{Mismatch: true, Host: hostname, KeyType: key.Type(), Fingerprint: fp, Known: known}
		}
		if acceptFingerprint != "" && acceptFingerprint == fp {
			return s.add(hostname, key)
		}
		return &HostKeyError{Host: hostname, KeyType: key.Type(), Fingerprint: fp}
	}

	return cb, knownAlgorithms(check, addr), nil
}

func knownAlgorithms(check ssh.HostKeyCallback, addr string) []string {
	pub, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil
	}
	probe, err := ssh.NewPublicKey(pub)
	if err != nil {
		return nil
	}
	err = check(addr, &net.TCPAddr{IP: net.IPv4zero}, probe)
	var keyErr *knownhosts.KeyError
	if !errors.As(err, &keyErr) || len(keyErr.Want) == 0 {
		return nil
	}

	seen := map[string]bool{}
	var algos []string
	push := func(a string) {
		if !seen[a] {
			seen[a] = true
			algos = append(algos, a)
		}
	}
	for _, k := range keyErr.Want {
		switch t := k.Key.Type(); t {
		case ssh.KeyAlgoRSA:
			push(ssh.KeyAlgoRSASHA512)
			push(ssh.KeyAlgoRSASHA256)
			push(ssh.KeyAlgoRSA)
		default:
			push(t)
		}
	}
	return algos
}
