package connection

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"path"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
	"terminyxx/internal/sshkeys"
)

// AgentStatus is what the local ssh-agent holds.
type AgentStatus struct {
	Running bool               `json:"running"`
	Keys    []sshkeys.AgentKey `json:"keys"`
}

// ListAgentKeys lists the keys loaded in the local ssh-agent.
func ListAgentKeys() (AgentStatus, error) {
	st := AgentStatus{Keys: []sshkeys.AgentKey{}}
	conn := dialAgent()
	if conn == nil {
		return st, nil
	}
	defer conn.Close()
	keys, err := agent.NewClient(conn).List()
	if err != nil {
		return st, err
	}
	st.Running = true
	for _, k := range keys {
		pub, err := ssh.ParsePublicKey(k.Blob)
		if err != nil {
			continue
		}
		st.Keys = append(st.Keys, sshkeys.AgentKey{
			Type:        pub.Type(),
			Fingerprint: ssh.FingerprintSHA256(pub),
			Comment:     sshkeys.SafeComment(k.Comment),
			PublicKey:   sshkeys.AuthorizedLine(pub, k.Comment),
		})
	}
	return st, nil
}

// maxAuthorizedKeys caps how much of an existing authorized_keys is read.
const maxAuthorizedKeys = 1 << 20

// InstallPublicKey adds an authorized_keys line to ~/.ssh/authorized_keys on
// the server of connection id, over SFTP (no shell, so it also works on
// SFTP-only accounts). It creates ~/.ssh (0700) and the file (0600) when
// missing and reports false when the key was already there.
func (m *ConnectionManager) InstallPublicKey(id, line string) (bool, error) {
	pub, comment, _, _, err := ssh.ParseAuthorizedKey([]byte(line))
	if err != nil {
		return false, fmt.Errorf("not a public key: %w", err)
	}
	b, err := m.sftp(id)
	if err != nil {
		return false, err
	}
	c := b.client
	home, err := c.Getwd()
	if err != nil {
		return false, err
	}
	dir := path.Join(home, ".ssh")
	if _, err := c.Stat(dir); errors.Is(err, os.ErrNotExist) {
		if err := c.Mkdir(dir); err != nil {
			return false, fmt.Errorf("create %s: %w", dir, err)
		}
		_ = c.Chmod(dir, 0o700)
	} else if err != nil {
		return false, err
	}

	file := path.Join(dir, "authorized_keys")
	var existing []byte
	created := false
	if f, err := c.Open(file); err == nil {
		existing, err = io.ReadAll(io.LimitReader(f, maxAuthorizedKeys))
		f.Close()
		if err != nil {
			return false, err
		}
	} else if errors.Is(err, os.ErrNotExist) {
		created = true
	} else {
		return false, err
	}
	want := pub.Marshal()
	for _, l := range bytes.Split(existing, []byte("\n")) {
		if k, _, _, _, err := ssh.ParseAuthorizedKey(l); err == nil && bytes.Equal(k.Marshal(), want) {
			return false, nil
		}
	}

	add := sshkeys.AuthorizedLine(pub, comment) + "\n"
	if len(existing) > 0 && existing[len(existing)-1] != '\n' {
		add = "\n" + add
	}
	f, err := c.OpenFile(file, os.O_WRONLY|os.O_CREATE|os.O_APPEND)
	if err != nil {
		return false, fmt.Errorf("open %s: %w", file, err)
	}
	if created {
		_ = c.Chmod(file, 0o600)
	}
	if _, err := f.Write([]byte(add)); err != nil {
		f.Close()
		return false, err
	}
	return true, f.Close()
}
