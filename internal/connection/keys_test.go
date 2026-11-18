package connection

import (
	"strings"
	"testing"
)

const testPub = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl me@laptop"

func TestInstallPublicKey(t *testing.T) {
	s := newTestServer(t, serverOpts{password: "secret"})
	m, _, _ := newManager(t)
	connectTrusted(t, m, passwordReq(s, "k"))

	added, err := m.InstallPublicKey("k", testPub+"\n")
	if err != nil || !added {
		t.Fatalf("first install: %v %v", added, err)
	}
	// The same key again (other comment) is recognised and not added twice.
	added, err = m.InstallPublicKey("k", strings.Replace(testPub, "me@laptop", "other", 1))
	if err != nil || added {
		t.Fatalf("second install: %v %v", added, err)
	}
	home, _ := m.GetRemoteHome("k")
	path := strings.TrimSuffix(home, "/") + "/.ssh/authorized_keys"
	content, err := m.ReadRemoteFile("k", path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(content, "ssh-ed25519 ") != 1 || !strings.HasSuffix(content, "me@laptop\n") {
		t.Fatalf("authorized_keys = %q", content)
	}

	if _, err := m.InstallPublicKey("k", "not a key; rm -rf /"); err == nil {
		t.Fatal("garbage must be refused")
	}
}
