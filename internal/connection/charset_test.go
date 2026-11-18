package connection

import (
	"bytes"
	"io"
	"strings"
	"testing"
)

func TestCharsetRoundTrip(t *testing.T) {
	enc, err := lookupCharset("Windows-1251")
	if err != nil || enc == nil {
		t.Fatalf("lookup: %v", err)
	}
	raw := encodeInput([]byte("привет ✓"), enc)
	// "привет" in cp1251, then a space, and '?' for the check mark it lacks.
	want := []byte{0xEF, 0xF0, 0xE8, 0xE2, 0xE5, 0xF2, ' ', '?'}
	if !bytes.Equal(raw, want) {
		t.Fatalf("encoded % X, want % X", raw, want)
	}
	back, _ := io.ReadAll(decodeReader(bytes.NewReader(raw[:6]), enc))
	if string(back) != "привет" {
		t.Fatalf("decoded %q", back)
	}
	if e, err := lookupCharset(""); e != nil || err != nil {
		t.Fatal("empty name must mean UTF-8")
	}
	if _, err := lookupCharset("ebcdic"); err == nil {
		t.Fatal("unknown charset must be refused")
	}
}

func TestStartupInput(t *testing.T) {
	got := startupInput("sudo -i\r\n\n  \ncd /app\n")
	if got != "sudo -i\rcd /app\r" {
		t.Fatalf("startupInput = %q", got)
	}
	if len(startupInput(strings.Repeat("x", maxStartup+100))) > maxStartup+1 {
		t.Fatal("startup input is not capped")
	}
}

func TestStartupCommandsAndCharsetOverSSH(t *testing.T) {
	s := newTestServer(t, serverOpts{password: "secret"})
	m, rec, _ := newManager(t)
	req := passwordReq(s, "c")
	req.Encoding = "windows-1251"
	req.Startup = "echo один\nls"
	connectTrusted(t, m, req)
	if err := m.StartShell("c", 80, 24); err != nil {
		t.Fatal(err)
	}
	rec.waitFor(t, "startup", func() bool {
		out := rec.output("c")
		return strings.Contains(out, "out:echo один") && strings.Contains(out, "out:ls")
	})
	// A second StartShell (remount) only resizes and must not type them again.
	if err := m.StartShell("c", 100, 30); err != nil {
		t.Fatal(err)
	}
	if err := m.WriteInput("c", "привет\r"); err != nil {
		t.Fatal(err)
	}
	rec.waitFor(t, "echo", func() bool { return strings.Contains(rec.output("c"), "out:привет") })
	if n := strings.Count(rec.output("c"), "out:ls"); n != 1 {
		t.Fatalf("startup commands typed %d times", n)
	}
}

func TestUnknownCharsetFailsConnect(t *testing.T) {
	s := newTestServer(t, serverOpts{password: "secret"})
	m, _, _ := newManager(t)
	req := passwordReq(s, "x")
	req.Encoding = "ebcdic"
	if err := m.Connect(req); err == nil || !strings.Contains(err.Error(), "encoding") {
		t.Fatalf("expected an encoding error, got %v", err)
	}
}
