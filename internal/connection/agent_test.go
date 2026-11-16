package connection

import (
	"crypto/ed25519"
	"crypto/rand"
	"net"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
)

// isolateHome points the home dir at an empty temp dir so tests never read
// the developer's real ~/.ssh keys.
func isolateHome(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
}

func TestAgentAuth(t *testing.T) {
	isolateHome(t)
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	sshPub, _ := ssh.NewPublicKey(pub)

	keyring := agent.NewKeyring()
	if err := keyring.Add(agent.AddedKey{PrivateKey: priv}); err != nil {
		t.Fatal(err)
	}
	sock := filepath.Join(t.TempDir(), "agent.sock")
	ln, err := net.Listen("unix", sock)
	if err != nil {
		t.Skipf("unix sockets unavailable: %v", err)
	}
	t.Cleanup(func() { ln.Close() })
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func() { _ = agent.ServeAgent(keyring, c); c.Close() }()
		}
	}()
	t.Setenv("SSH_AUTH_SOCK", sock)

	s := newTestServer(t, serverOpts{authorizedKey: sshPub})
	m, _, _ := newManager(t)
	connectTrusted(t, m, ConnectRequest{ID: "ag", Host: s.host, Port: s.port, Username: "u", AuthType: "key"})
}

func TestKeyAuthWithoutAnyKey(t *testing.T) {
	isolateHome(t)
	t.Setenv("SSH_AUTH_SOCK", filepath.Join(t.TempDir(), "missing.sock"))
	_, _, err := buildAuthMethods(ConnectRequest{AuthType: "key"})
	if err == nil || !strings.Contains(err.Error(), "no SSH key found") {
		t.Fatalf("want helpful error, got %v", err)
	}
}
