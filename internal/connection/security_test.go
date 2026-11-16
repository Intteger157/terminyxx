package connection

import (
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"os"
	"strings"
	"sync"
	"testing"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
)

func TestOutputGateQueuesWhileLocked(t *testing.T) {
	g := NewOutputGate()
	var mu sync.Mutex
	var got []string
	send := func(s string) {
		g.Send("a", len(s), func() { mu.Lock(); got = append(got, s); mu.Unlock() })
	}
	send("1")
	g.SetLocked(true)
	send("2")
	send("3")
	mu.Lock()
	if strings.Join(got, "") != "1" {
		t.Fatalf("output leaked while locked: %v", got)
	}
	mu.Unlock()
	g.SetLocked(false)
	send("4")
	if strings.Join(got, "") != "1234" {
		t.Fatalf("wrong replay order: %v", got)
	}
}

func TestLockRefusesInput(t *testing.T) {
	s := newTestServer(t, serverOpts{password: "secret"})
	m, rec, _ := newManager(t)
	connectTrusted(t, m, passwordReq(s, "t"))
	must(t, m.StartShell("t", 80, 24))
	rec.waitFor(t, "banner", func() bool { return strings.Contains(rec.output("t"), "$ ") })

	m.SetLocked(true)
	if err := m.WriteInput("t", "x\r"); !errors.Is(err, ErrLocked) {
		t.Fatalf("input while locked: %v", err)
	}
	m.SetLocked(false)
	must(t, m.WriteInput("t", "ok\r"))
	rec.waitFor(t, "echo", func() bool { return strings.Contains(rec.output("t"), "out:ok") })
}

func TestMaskingEndToEnd(t *testing.T) {
	s := newTestServer(t, serverOpts{password: "secret"})
	m, rec, _ := newManager(t)
	connectTrusted(t, m, passwordReq(s, "t"))
	must(t, m.StartShell("t", 80, 24))
	rec.waitFor(t, "banner", func() bool { return strings.Contains(rec.output("t"), "$ ") })

	m.SetPolicy(Policy{MaskOutput: true, StrictAlgorithms: true})
	must(t, m.WriteInput("t", "API_KEY=abc123\r"))
	rec.waitFor(t, "masked echo", func() bool { return strings.Contains(rec.output("t"), "out:API_KEY=••••••") })
	if strings.Contains(rec.output("t"), "abc123") {
		t.Fatal("secret reached the terminal")
	}

	m.SetPolicy(Policy{StrictAlgorithms: true})
	must(t, m.WriteInput("t", "API_KEY=visible\r"))
	rec.waitFor(t, "plain echo", func() bool { return strings.Contains(rec.output("t"), "out:API_KEY=visible") })
}

func TestHostKeyReplaceAndRevoke(t *testing.T) {
	s := newTestServer(t, serverOpts{password: "secret"})
	m, _, hk := newManager(t)

	pub, _, _ := ed25519.GenerateKey(rand.Reader)
	old, _ := ssh.NewPublicKey(pub)
	line := knownhosts.Line([]string{knownhosts.Normalize(s.addr)}, old) + "\n"
	must(t, os.WriteFile(hk.appFile, []byte(line), 0o600))

	err := m.Connect(passwordReq(s, "a"))
	var hkErr *HostKeyError
	if !errors.As(err, &hkErr) || !hkErr.Mismatch {
		t.Fatalf("want mismatch, got %v", err)
	}
	if len(hkErr.Known) != 1 || !strings.Contains(hkErr.Known[0], ssh.FingerprintSHA256(old)) {
		t.Fatalf("old key not reported: %v", hkErr.Known)
	}
	if !strings.HasSuffix(err.Error(), "|"+hkErr.Known[0]) {
		t.Fatalf("error string lacks known keys: %q", err.Error())
	}

	req := passwordReq(s, "a")
	req.AcceptHostKey = hkErr.Fingerprint
	req.ReplaceHostKey = true
	must(t, m.Connect(req))
	// The new key is now the trusted one.
	must(t, m.Connect(passwordReq(s, "b")))

	hosts, err := m.TrustedHosts()
	must(t, err)
	if len(hosts) != 1 || hosts[0].Fingerprint != hkErr.Fingerprint || hosts[0].Source != "app" {
		t.Fatalf("unexpected trusted hosts: %+v", hosts)
	}
	must(t, m.RemoveTrustedHost(hosts[0].ID))
	if hosts, _ := m.TrustedHosts(); len(hosts) != 0 {
		t.Fatalf("host not revoked: %+v", hosts)
	}
	if err := m.Connect(passwordReq(s, "c")); !errors.As(err, &hkErr) || hkErr.Mismatch {
		t.Fatalf("revoked host should prompt again, got %v", err)
	}
}

func TestModernAlgorithms(t *testing.T) {
	a := modernAlgorithms()
	for _, list := range [][]string{a.KeyExchanges, a.Ciphers, a.MACs, a.HostKeys} {
		for _, alg := range list {
			if alg == ssh.KeyAlgoRSA || alg == ssh.HMACSHA1 || strings.Contains(alg, "cbc") || strings.HasSuffix(alg, "sha1") {
				t.Errorf("weak algorithm allowed: %s", alg)
			}
		}
	}
	if len(a.Ciphers) == 0 || len(a.KeyExchanges) == 0 {
		t.Fatal("no algorithms left")
	}
}
