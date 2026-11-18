// Package sshkeys lists and creates the user's SSH key files in ~/.ssh.
package sshkeys

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"golang.org/x/crypto/ssh"
)

// Key describes a private key file (and its public key, if readable).
type Key struct {
	// Name is the file name in the folder, e.g. id_ed25519.
	Name string `json:"name"`
	Path string `json:"path"`
	// Type is the public key algorithm, e.g. ssh-ed25519 ("" if unknown).
	Type string `json:"type"`
	// Fingerprint is the SHA256 fingerprint ("" if unknown).
	Fingerprint string `json:"fingerprint"`
	Comment     string `json:"comment"`
	// Encrypted means the private key needs a passphrase.
	Encrypted bool `json:"encrypted"`
	// PublicKey is the authorized_keys line ("" if it can't be derived).
	PublicKey string `json:"publicKey"`
}

// AgentKey is a key loaded in the running ssh-agent.
type AgentKey struct {
	Type        string `json:"type"`
	Fingerprint string `json:"fingerprint"`
	Comment     string `json:"comment"`
	PublicKey   string `json:"publicKey"`
}

// Dir is the user's ~/.ssh folder.
func Dir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".ssh"), nil
}

// skip are files in ~/.ssh that are never keys.
var skip = map[string]bool{"known_hosts": true, "known_hosts.old": true, "config": true, "authorized_keys": true, "authorized_keys2": true, "environment": true}

const maxKeyFile = 64 << 10

// List returns the private keys in dir, sorted by name.
func List(dir string) ([]Key, error) {
	entries, err := os.ReadDir(dir)
	if errors.Is(err, fs.ErrNotExist) {
		return []Key{}, nil
	}
	if err != nil {
		return nil, err
	}
	keys := []Key{}
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || skip[name] || strings.HasSuffix(name, ".pub") || strings.HasPrefix(name, ".") {
			continue
		}
		if k, ok := readKey(filepath.Join(dir, name)); ok {
			keys = append(keys, k)
		}
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i].Name < keys[j].Name })
	return keys, nil
}

// readKey reports whether path is a private key and describes it.
func readKey(path string) (Key, bool) {
	k := Key{Name: filepath.Base(path), Path: path}
	info, err := os.Stat(path)
	if err != nil || info.Size() > maxKeyFile {
		return k, false
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return k, false
	}
	text := string(data)
	isPPK := strings.HasPrefix(text, "PuTTY-User-Key-File-")
	if !strings.Contains(text, "PRIVATE KEY-----") && !isPPK {
		return k, false
	}
	var pub ssh.PublicKey
	if !isPPK {
		signer, err := ssh.ParsePrivateKey(data)
		var missing *ssh.PassphraseMissingError
		switch {
		case err == nil:
			pub = signer.PublicKey()
		case errors.As(err, &missing):
			k.Encrypted = true
			pub = missing.PublicKey // OpenSSH format keeps it unencrypted
		}
	} else {
		k.Encrypted = strings.Contains(text, "Encryption: aes")
		pub, k.Comment = ppkPublic(text)
	}
	// The .pub file carries the comment, and the key for formats we can't read.
	if raw, err := os.ReadFile(path + ".pub"); err == nil && len(raw) < maxKeyFile {
		if p, comment, _, _, err := ssh.ParseAuthorizedKey(raw); err == nil {
			if pub == nil || ssh.FingerprintSHA256(pub) == ssh.FingerprintSHA256(p) {
				pub = p
				k.Comment = comment
			}
		}
	}
	if pub != nil {
		k.Type = pub.Type()
		k.Fingerprint = ssh.FingerprintSHA256(pub)
		k.PublicKey = AuthorizedLine(pub, k.Comment)
	}
	return k, true
}

var nameRe = regexp.MustCompile(`^[A-Za-z0-9_][A-Za-z0-9._-]{0,63}$`)

// ValidName checks a key file name: plain characters, no path.
func ValidName(name string) error {
	if !nameRe.MatchString(name) || strings.HasSuffix(name, ".pub") || skip[name] {
		return fmt.Errorf("use a plain file name such as id_ed25519 (letters, digits, . _ -)")
	}
	return nil
}

// SafeComment keeps a comment to printable ASCII on one line, so it can't
// break an authorized_keys line or a shell command.
func SafeComment(c string) string {
	var b strings.Builder
	for _, r := range c {
		if r >= 0x20 && r < 0x7f && r != '\'' && r != '"' && r != '\\' && r != '`' {
			b.WriteRune(r)
		}
	}
	s := strings.TrimSpace(b.String())
	if len(s) > 120 {
		s = s[:120]
	}
	return s
}

// AuthorizedLine is the authorized_keys line for pub with a cleaned comment.
func AuthorizedLine(pub ssh.PublicKey, comment string) string {
	line := strings.TrimSpace(string(ssh.MarshalAuthorizedKey(pub)))
	if c := SafeComment(comment); c != "" {
		line += " " + c
	}
	return line
}

// Generate creates a new Ed25519 key pair dir/name and dir/name.pub. It never
// overwrites a file. An empty passphrase leaves the private key unencrypted.
func Generate(dir, name, comment, passphrase string) (Key, error) {
	if err := ValidName(name); err != nil {
		return Key{}, err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return Key{}, err
	}
	priv := filepath.Join(dir, name)
	for _, p := range []string{priv, priv + ".pub"} {
		if _, err := os.Lstat(p); err == nil {
			return Key{}, fmt.Errorf("%s already exists", filepath.Base(p))
		}
	}
	pubKey, privKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return Key{}, err
	}
	comment = SafeComment(comment)
	var block *pem.Block
	if passphrase != "" {
		block, err = ssh.MarshalPrivateKeyWithPassphrase(privKey, comment, []byte(passphrase))
	} else {
		block, err = ssh.MarshalPrivateKey(privKey, comment)
	}
	if err != nil {
		return Key{}, err
	}
	privPEM := pem.EncodeToMemory(block)
	sshPub, err := ssh.NewPublicKey(pubKey)
	if err != nil {
		return Key{}, err
	}
	if err := writeNew(priv, privPEM, 0o600); err != nil {
		return Key{}, err
	}
	if err := writeNew(priv+".pub", []byte(AuthorizedLine(sshPub, comment)+"\n"), 0o644); err != nil {
		_ = os.Remove(priv)
		return Key{}, err
	}
	k, _ := readKey(priv)
	return k, nil
}

// writeNew creates path (failing if it exists) with mode.
func writeNew(path string, data []byte, mode os.FileMode) error {
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode)
	if err != nil {
		return err
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		_ = os.Remove(path)
		return err
	}
	return f.Close()
}

// PublicLine returns the authorized_keys line of the key file at path.
func PublicLine(path string) (string, error) {
	k, ok := readKey(path)
	if !ok {
		return "", errors.New("not a private key file")
	}
	if k.PublicKey == "" {
		return "", errors.New("the public key of this file can't be read; keep a .pub file next to it")
	}
	return k.PublicKey, nil
}

// ppkPublic reads the public key and comment of a PuTTY .ppk file (v2 and
// v3 keep both unencrypted, even when the private part is encrypted).
func ppkPublic(text string) (ssh.PublicKey, string) {
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	comment := ""
	for i, l := range lines {
		if c, ok := strings.CutPrefix(l, "Comment: "); ok {
			comment = strings.TrimSpace(c)
		}
		n, ok := strings.CutPrefix(l, "Public-Lines: ")
		if !ok {
			continue
		}
		count, err := strconv.Atoi(strings.TrimSpace(n))
		if err != nil || count <= 0 || count > 64 || i+1+count > len(lines) {
			return nil, ""
		}
		blob, err := base64.StdEncoding.DecodeString(strings.Join(lines[i+1:i+1+count], ""))
		if err != nil {
			return nil, ""
		}
		pub, err := ssh.ParsePublicKey(blob)
		if err != nil {
			return nil, ""
		}
		return pub, comment
	}
	return nil, ""
}
