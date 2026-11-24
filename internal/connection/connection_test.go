package connection

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/pem"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
)

func newManager(t *testing.T) (*ConnectionManager, *recorder, *HostKeyStore) {
	t.Helper()
	rec := newRecorder()
	hk := NewHostKeyStore(filepath.Join(t.TempDir(), "known_hosts"), "")
	m := NewConnectionManager(rec, hk)
	t.Cleanup(m.CloseAll)
	return m, rec, hk
}

func passwordReq(s *testServer, id string) ConnectRequest {
	return ConnectRequest{ID: id, Host: s.host, Port: s.port, Username: "u", AuthType: "password", Password: "secret"}
}

// connectTrusted connects, accepting the host key on first use.
func connectTrusted(t *testing.T, m *ConnectionManager, req ConnectRequest) {
	t.Helper()
	err := m.Connect(req)
	var hk *HostKeyError
	if !errors.As(err, &hk) {
		t.Fatalf("expected host key prompt, got %v", err)
	}
	req.AcceptHostKey, req.AcceptHostKeyAddress = hk.Fingerprint, hk.Host
	if err := m.Connect(req); err != nil {
		t.Fatalf("connect after accepting key: %v", err)
	}
	if rec, ok := m.emitter.(*recorder); ok {
		rec.reset()
	}
}

func TestHostKeyTrustOnFirstUse(t *testing.T) {
	s := newTestServer(t, serverOpts{password: "secret"})
	m, _, _ := newManager(t)

	err := m.Connect(passwordReq(s, "a"))
	var hk *HostKeyError
	if !errors.As(err, &hk) || hk.Mismatch {
		t.Fatalf("want unknown host key error, got %v", err)
	}
	if !strings.HasPrefix(err.Error(), HostKeyUnknownPrefix+"|") {
		t.Fatalf("error string not machine readable: %q", err.Error())
	}
	if hk.Fingerprint != ssh.FingerprintSHA256(s.hostKey.PublicKey()) {
		t.Fatalf("fingerprint mismatch: %s", hk.Fingerprint)
	}

	// A wrong fingerprint must not be accepted.
	req := passwordReq(s, "a")
	req.AcceptHostKeyAddress = hk.Host
	req.AcceptHostKey = "SHA256:wrong"
	if err := m.Connect(req); !errors.As(err, &hk) {
		t.Fatalf("wrong fingerprint should still prompt, got %v", err)
	}

	req.AcceptHostKey = hk.Fingerprint
	if err := m.Connect(req); err != nil {
		t.Fatalf("connect with accepted key: %v", err)
	}
	// Now remembered: connecting again needs no confirmation.
	if err := m.Connect(passwordReq(s, "b")); err != nil {
		t.Fatalf("second connect: %v", err)
	}
}

func TestHostKeyMismatch(t *testing.T) {
	s := newTestServer(t, serverOpts{password: "secret"})
	m, _, hk := newManager(t)

	pub, _, _ := ed25519.GenerateKey(rand.Reader)
	other, _ := ssh.NewPublicKey(pub)
	line := knownhosts.Line([]string{knownhosts.Normalize(s.addr)}, other) + "\n"
	if err := os.WriteFile(hk.appFile, []byte(line), 0o600); err != nil {
		t.Fatal(err)
	}

	err := m.Connect(passwordReq(s, "a"))
	var hkErr *HostKeyError
	if !errors.As(err, &hkErr) || !hkErr.Mismatch {
		t.Fatalf("want mismatch, got %v", err)
	}
	// Accepting the fingerprint must not override a mismatch.
	req := passwordReq(s, "a")
	req.AcceptHostKey, req.AcceptHostKeyAddress = hkErr.Fingerprint, hkErr.Host
	if err := m.Connect(req); !errors.As(err, &hkErr) || !hkErr.Mismatch {
		t.Fatalf("mismatch must stay an error, got %v", err)
	}
}

func TestWrongPassword(t *testing.T) {
	s := newTestServer(t, serverOpts{password: "secret"})
	m, _, _ := newManager(t)
	req := passwordReq(s, "a")
	req.Password = "nope"
	err := m.Connect(req)
	var hk *HostKeyError
	if errors.As(err, &hk) {
		req.AcceptHostKey, req.AcceptHostKeyAddress = hk.Fingerprint, hk.Host
		err = m.Connect(req)
	}
	if err == nil || !strings.Contains(err.Error(), "unable to authenticate") {
		t.Fatalf("want auth failure, got %v", err)
	}
}

func TestKeyboardInteractivePassword(t *testing.T) {
	s := newTestServer(t, serverOpts{password: "secret", keyboardOnly: true})
	m, _, _ := newManager(t)
	connectTrusted(t, m, passwordReq(s, "a"))
}

func TestEncryptedKeyAuth(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	sshPub, _ := ssh.NewPublicKey(pub)
	block, err := ssh.MarshalPrivateKeyWithPassphrase(priv, "", []byte("pw"))
	if err != nil {
		t.Fatal(err)
	}
	keyPath := filepath.Join(t.TempDir(), "id_ed25519")
	if err := os.WriteFile(keyPath, pem.EncodeToMemory(block), 0o600); err != nil {
		t.Fatal(err)
	}

	s := newTestServer(t, serverOpts{authorizedKey: sshPub})
	m, _, _ := newManager(t)
	req := ConnectRequest{ID: "k", Host: s.host, Port: s.port, Username: "u", AuthType: "key", KeyPath: keyPath}

	if err := m.Connect(req); err == nil || !strings.HasPrefix(err.Error(), PassphraseRequiredPrefix) {
		t.Fatalf("want passphrase prompt, got %v", err)
	}
	req.Passphrase = "pw"
	connectTrusted(t, m, req)
}

func TestShellBannerUTF8AndEcho(t *testing.T) {
	s := newTestServer(t, serverOpts{password: "secret"})
	m, rec, _ := newManager(t)
	connectTrusted(t, m, passwordReq(s, "t"))

	if err := m.WriteInput("t", "x"); err == nil {
		t.Fatal("input before StartShell should fail")
	}
	if err := m.StartShell("t", 100, 40); err != nil {
		t.Fatal(err)
	}
	// Second call (React remount) only resizes.
	if err := m.StartShell("t", 120, 40); err != nil {
		t.Fatal(err)
	}

	rec.waitFor(t, "banner", func() bool { return strings.Contains(rec.output("t"), "$ ") })
	if out := rec.output("t"); out != testBanner {
		t.Fatalf("banner garbled:\n got %q\nwant %q", out, testBanner)
	}

	if err := m.WriteInput("t", "привет\r"); err != nil {
		t.Fatal(err)
	}
	rec.waitFor(t, "echo", func() bool { return strings.Contains(rec.output("t"), "out:привет") })
}

func TestShellExitDropsConnection(t *testing.T) {
	s := newTestServer(t, serverOpts{password: "secret"})
	m, rec, _ := newManager(t)
	connectTrusted(t, m, passwordReq(s, "e"))
	if err := m.StartShell("e", 80, 24); err != nil {
		t.Fatal(err)
	}
	if err := m.WriteInput("e", "exit\r"); err != nil {
		t.Fatal(err)
	}
	rec.waitFor(t, "closed", func() bool { return rec.has("terminal:closed:e", nil) })
	rec.waitFor(t, "disconnected", func() bool { return rec.hasReason("connection:state:e", "disconnected", CloseExit) })
	if _, err := m.get("e"); !errors.Is(err, ErrNotFound) {
		t.Fatal("connection should be removed after shell exit")
	}
}

func TestServerDisappears(t *testing.T) {
	s := newTestServer(t, serverOpts{password: "secret"})
	m, rec, _ := newManager(t)
	connectTrusted(t, m, passwordReq(s, "d"))
	conn, _ := m.get("d")
	conn.Client().Conn.Close() // simulate network drop
	rec.waitFor(t, "disconnected", func() bool { return rec.hasReason("connection:state:d", "disconnected", CloseLost) })
}

func TestServerDisappearsWithShell(t *testing.T) {
	s := newTestServer(t, serverOpts{password: "secret"})
	m, rec, _ := newManager(t)
	connectTrusted(t, m, passwordReq(s, "ds"))
	if err := m.StartShell("ds", 80, 24); err != nil {
		t.Fatal(err)
	}
	conn, _ := m.get("ds")
	conn.Client().Conn.Close() // network drop while the shell runs
	rec.waitFor(t, "disconnected", func() bool { return rec.hasReason("connection:state:ds", "disconnected", CloseLost) })
}

func TestDisconnectReason(t *testing.T) {
	s := newTestServer(t, serverOpts{password: "secret"})
	m, rec, _ := newManager(t)
	connectTrusted(t, m, passwordReq(s, "u"))
	if err := m.Disconnect("u"); err != nil {
		t.Fatal(err)
	}
	if !rec.hasReason("connection:state:u", "disconnected", CloseByUser) {
		t.Fatal("explicit disconnect should report reason closed")
	}
}

func TestIncompleteTail(t *testing.T) {
	ru := []byte("я")    // 2 bytes
	emoji := []byte("🚀") // 4 bytes
	cases := []struct {
		in   []byte
		want int
	}{
		{[]byte("abc"), 0},
		{ru, 0},
		{ru[:1], 1},
		{append([]byte("a"), emoji[:3]...), 3},
		{emoji, 0},
		{append([]byte("ok"), emoji[:1]...), 1},
	}
	for _, c := range cases {
		if got := incompleteTail(c.in); got != c.want {
			t.Errorf("incompleteTail(%q) = %d, want %d", c.in, got, c.want)
		}
	}
}

func TestStreamUTF8(t *testing.T) {
	text := "Привет, мир 🚀 ok"
	r := &chunkReader{data: []byte(text), size: 3}
	var got strings.Builder
	streamUTF8(r, func(s string) {
		if strings.ContainsRune(s, '�') {
			t.Errorf("chunk has broken rune: %q", s)
		}
		got.WriteString(s)
	})
	if got.String() != text {
		t.Fatalf("got %q", got.String())
	}
}

type chunkReader struct {
	data []byte
	size int
}

func (c *chunkReader) Read(b []byte) (int, error) {
	if len(c.data) == 0 {
		return 0, errEOF
	}
	n := c.size
	if n > len(c.data) {
		n = len(c.data)
	}
	if n > len(b) {
		n = len(b)
	}
	copy(b, c.data[:n])
	c.data = c.data[n:]
	return n, nil
}

var errEOF = errors.New("EOF")
