package connection

import (
	"bytes"
	"crypto/ed25519"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/kayrus/putty"
	"golang.org/x/crypto/ssh"
)

// ErrPassphraseRequired is returned (as a string prefix) when the private key
// is encrypted and no passphrase was given, so the UI can ask for one.
const PassphraseRequiredPrefix = "KEY_PASSPHRASE_REQUIRED"

func expandHome(p string) string {
	if p == "~" || strings.HasPrefix(p, "~/") || strings.HasPrefix(p, `~\`) {
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, p[1:])
		}
	}
	return p
}

func defaultKeyPaths() []string {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}
	var paths []string
	for _, name := range []string{"id_ed25519", "id_ecdsa", "id_rsa"} {
		p := filepath.Join(home, ".ssh", name)
		if _, err := os.Stat(p); err == nil {
			paths = append(paths, p)
		}
	}
	return paths
}

func loadSigner(path, passphrase string) (ssh.Signer, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read key %s: %w", path, err)
	}
	if bytes.HasPrefix(bytes.TrimSpace(data), []byte("PuTTY-User-Key-File-")) {
		return loadPuTTYSigner(path, data, passphrase)
	}
	signer, err := ssh.ParsePrivateKey(data)
	var missing *ssh.PassphraseMissingError
	if errors.As(err, &missing) {
		if passphrase == "" {
			return nil, fmt.Errorf("%s|%s", PassphraseRequiredPrefix, path)
		}
		signer, err = ssh.ParsePrivateKeyWithPassphrase(data, []byte(passphrase))
	}
	if err != nil {
		return nil, fmt.Errorf("parse key %s: %w", path, err)
	}
	return signer, nil
}

// buildAuthMethods returns the auth methods for req and a cleanup func that
// closes the ssh-agent connection once the handshake is done.
func buildAuthMethods(req ConnectRequest) ([]ssh.AuthMethod, func(), error) {
	var auths []ssh.AuthMethod
	cleanup := func() {}

	if req.AuthType == "key" {
		// Like OpenSSH: an explicit key first, then the agent; without an
		// explicit key, the agent and then the default ~/.ssh keys.
		agentMethod, closeAgent := agentAuth()
		cleanup = closeAgent

		if req.KeyPath != "" {
			s, err := loadSigner(expandHome(req.KeyPath), req.Passphrase)
			if err != nil {
				cleanup()
				return nil, func() {}, err
			}
			auths = append(auths, ssh.PublicKeys(s))
			if agentMethod != nil {
				auths = append(auths, agentMethod)
			}
		} else {
			if agentMethod != nil {
				auths = append(auths, agentMethod)
			}
			var signers []ssh.Signer
			var firstErr error
			for _, p := range defaultKeyPaths() {
				s, err := loadSigner(p, req.Passphrase)
				if err != nil {
					if firstErr == nil {
						firstErr = err
					}
					continue
				}
				signers = append(signers, s)
			}
			if len(signers) > 0 {
				auths = append(auths, ssh.PublicKeys(signers...))
			}
			if len(auths) == 0 {
				cleanup()
				if firstErr != nil {
					return nil, func() {}, firstErr
				}
				return nil, func() {}, errors.New("no SSH key found: no ssh-agent keys and nothing in ~/.ssh; specify a key path")
			}
		}
	}

	if req.Password != "" || req.AuthType != "key" {
		password := req.Password
		auths = append(auths,
			ssh.Password(password),
			// Many servers only allow keyboard-interactive for passwords.
			ssh.KeyboardInteractive(func(_, _ string, questions []string, _ []bool) ([]string, error) {
				answers := make([]string, len(questions))
				for i := range answers {
					answers[i] = password
				}
				return answers, nil
			}),
		)
	}
	return auths, cleanup, nil
}

// loadPuTTYSigner reads a PuTTY .ppk key (versions 2 and 3, as used by
// PuTTY, WinSCP and KiTTY), encrypted or not.
func loadPuTTYSigner(path string, data []byte, passphrase string) (ssh.Signer, error) {
	k, err := putty.New(data)
	if err != nil {
		return nil, fmt.Errorf("parse key %s: %w", path, err)
	}
	if k.Encryption != "none" && passphrase == "" {
		return nil, fmt.Errorf("%s|%s", PassphraseRequiredPrefix, path)
	}
	raw, err := k.ParseRawPrivateKey([]byte(passphrase))
	if err != nil {
		if k.Encryption != "none" {
			return nil, fmt.Errorf("parse key %s: wrong passphrase (decrypt failed): %w", path, err)
		}
		return nil, fmt.Errorf("parse key %s: %w", path, err)
	}
	if p, ok := raw.(*ed25519.PrivateKey); ok {
		raw = *p
	}
	signer, err := ssh.NewSignerFromKey(raw)
	if err != nil {
		return nil, fmt.Errorf("parse key %s: %w", path, err)
	}
	return signer, nil
}
