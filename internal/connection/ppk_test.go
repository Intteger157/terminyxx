package connection

import (
	"strings"
	"testing"
)

func TestLoadPuTTYKeys(t *testing.T) {
	if _, err := loadSigner("testdata/rsa-v3-plain.ppk", ""); err != nil {
		t.Fatalf("unencrypted v3: %v", err)
	}
	for _, f := range []string{"testdata/rsa-v3-enc.ppk", "testdata/ed25519-v2-enc.ppk"} {
		if _, err := loadSigner(f, ""); err == nil || !strings.HasPrefix(err.Error(), PassphraseRequiredPrefix) {
			t.Fatalf("%s without passphrase: want prompt, got %v", f, err)
		}
		if _, err := loadSigner(f, "nope"); err == nil || !strings.Contains(err.Error(), "decrypt") {
			t.Fatalf("%s wrong passphrase: %v", f, err)
		}
		if _, err := loadSigner(f, "testkey"); err != nil {
			t.Fatalf("%s: %v", f, err)
		}
	}
}

func TestConnectWithPPK(t *testing.T) {
	isolateHome(t)
	t.Setenv("SSH_AUTH_SOCK", "")
	signer, err := loadSigner("testdata/ed25519-v2-enc.ppk", "testkey")
	if err != nil {
		t.Fatal(err)
	}
	s := newTestServer(t, serverOpts{authorizedKey: signer.PublicKey()})
	m, _, _ := newManager(t)
	connectTrusted(t, m, ConnectRequest{ID: "p", Host: s.host, Port: s.port, Username: "u", AuthType: "key",
		KeyPath: "testdata/ed25519-v2-enc.ppk", Passphrase: "testkey"})
}
