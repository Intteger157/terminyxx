package connection

import (
	"errors"
	"testing"

	"golang.org/x/crypto/ssh"
)

func TestSSHDiagnostic(t *testing.T) {
	s := newTestServer(t, serverOpts{password: "secret"})
	m, _, _ := newManager(t)
	req := passwordReq(s, "diagnose")
	req.AcceptHostKey = ssh.FingerprintSHA256(s.hostKey.PublicKey())
	req.AcceptHostKeyAddress = s.addr

	// A probe must not trust a key, even when passed an acceptance token.
	report := m.TestSSH(req)
	last := report.Checks[len(report.Checks)-1]
	if last.Stage != "Host key" || last.Failure == "" {
		t.Fatalf("unknown host key: %+v", report)
	}
	req.AcceptHostKey, req.AcceptHostKeyAddress = "", ""
	connectTrusted(t, m, req)
	must(t, m.Disconnect(req.ID))

	report = m.TestSSH(req)
	last = report.Checks[len(report.Checks)-1]
	if last.Stage != "Authentication" || last.Failure != "" {
		t.Fatalf("successful login: %+v", report)
	}
	if _, err := m.get(req.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("probe left a managed connection: %v", err)
	}

	req.Password = "wrong"
	report, err := m.ConnectWithDiagnostic(req)
	if err == nil {
		t.Fatal("wrong password authenticated")
	}
	last = report.Checks[len(report.Checks)-1]
	if last.Stage != "Authentication" || last.Failure == "" {
		t.Fatalf("wrong password: %+v", report)
	}
}

func TestSSHDiagnosticReportsFailedHop(t *testing.T) {
	jump := newTestServer(t, serverOpts{password: "secret"})
	target := newTestServer(t, serverOpts{password: "secret"})
	m, _, _ := newManager(t)
	hop := passwordReq(jump, "jump")
	connectTrusted(t, m, hop)
	must(t, m.Disconnect(hop.ID))
	must(t, target.listener.Close())

	req := passwordReq(target, "target")
	req.Jump = []ConnectRequest{hop}
	report := m.TestSSH(req)
	checks := report.Checks
	if len(checks) < 2 {
		t.Fatalf("missing hop details: %+v", report)
	}
	passed, failed := checks[len(checks)-2], checks[len(checks)-1]
	if !passed.Jump || passed.Address != jump.addr || passed.Stage != "Authentication" || passed.Failure != "" ||
		failed.Jump || failed.Address != target.addr || failed.Stage != "TCP via jump host" || failed.Failure == "" {
		t.Fatalf("incorrect failed hop: %+v", report)
	}
}

func TestHostKeyConfirmationBelongsToOneAddress(t *testing.T) {
	jump := newTestServer(t, serverOpts{password: "secret"})
	target := newTestServer(t, serverOpts{password: "secret", hostKey: jump.hostKey})
	m, _, _ := newManager(t)
	req := passwordReq(target, "target")
	req.Jump = []ConnectRequest{passwordReq(jump, "jump")}
	var hk *HostKeyError
	if err := m.Connect(req); !errors.As(err, &hk) || hk.Host != jump.addr {
		t.Fatalf("expected a prompt for the jump host, got %v", err)
	}
	req.AcceptHostKey, req.AcceptHostKeyAddress = hk.Fingerprint, hk.Host
	if err := m.Connect(req); !errors.As(err, &hk) || hk.Host != target.addr {
		t.Fatalf("the target needs its own confirmation, got %v", err)
	}
	req.AcceptHostKey, req.AcceptHostKeyAddress = hk.Fingerprint, hk.Host
	must(t, m.Connect(req))
}
