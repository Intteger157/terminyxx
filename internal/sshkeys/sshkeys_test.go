package sshkeys

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestGenerateAndList(t *testing.T) {
	dir := filepath.Join(t.TempDir(), ".ssh")
	k, err := Generate(dir, "id_test", "me@laptop", "")
	if err != nil {
		t.Fatal(err)
	}
	if k.Type != "ssh-ed25519" || k.Encrypted || !strings.HasPrefix(k.Fingerprint, "SHA256:") || k.Comment != "me@laptop" {
		t.Fatalf("key = %+v", k)
	}
	if !strings.HasPrefix(k.PublicKey, "ssh-ed25519 AAAA") || !strings.HasSuffix(k.PublicKey, " me@laptop") {
		t.Fatalf("public line = %q", k.PublicKey)
	}
	if runtime.GOOS != "windows" {
		if fi, _ := os.Stat(filepath.Join(dir, "id_test")); fi.Mode().Perm() != 0o600 {
			t.Fatalf("private key mode %v", fi.Mode().Perm())
		}
	}

	enc, err := Generate(dir, "id_locked", "", "correct horse")
	if err != nil {
		t.Fatal(err)
	}
	if !enc.Encrypted || enc.Fingerprint == "" {
		t.Fatalf("encrypted key = %+v", enc)
	}

	// Never overwrite.
	if _, err := Generate(dir, "id_test", "", ""); err == nil {
		t.Fatal("expected an error for an existing key")
	}

	_ = os.WriteFile(filepath.Join(dir, "known_hosts"), []byte("x"), 0o600)
	_ = os.WriteFile(filepath.Join(dir, "notes.txt"), []byte("hello"), 0o600)
	list, err := List(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || list[0].Name != "id_locked" || list[1].Name != "id_test" {
		t.Fatalf("list = %+v", list)
	}
	line, err := PublicLine(filepath.Join(dir, "id_test"))
	if err != nil || line != k.PublicKey {
		t.Fatalf("PublicLine = %q, %v", line, err)
	}
}

func TestNamesAndComments(t *testing.T) {
	for _, bad := range []string{"", "../x", "a/b", `a\b`, ".hidden", "id.pub", "known_hosts", strings.Repeat("a", 70)} {
		if ValidName(bad) == nil {
			t.Errorf("%q should be refused", bad)
		}
	}
	if err := ValidName("id_ed25519_work-2"); err != nil {
		t.Fatal(err)
	}
	if got := SafeComment("me@host\n'; rm -rf / #`x`"); strings.ContainsAny(got, "\n'`") {
		t.Fatalf("comment not cleaned: %q", got)
	}
}

func TestListMissingDir(t *testing.T) {
	list, err := List(filepath.Join(t.TempDir(), "nope"))
	if err != nil || len(list) != 0 {
		t.Fatalf("missing dir: %v %v", list, err)
	}
}

func TestPPKPublicKey(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"ed25519-v2-enc.ppk", "rsa-v3-enc.ppk", "rsa-v3-plain.ppk"} {
		data, err := os.ReadFile(filepath.Join("..", "connection", "testdata", name))
		if err != nil {
			t.Fatal(err)
		}
		_ = os.WriteFile(filepath.Join(dir, name), data, 0o600)
	}
	list, err := List(dir)
	if err != nil || len(list) != 3 {
		t.Fatalf("list: %v %v", list, err)
	}
	for _, k := range list {
		if k.Type == "" || k.PublicKey == "" || !strings.HasPrefix(k.Fingerprint, "SHA256:") {
			t.Errorf("%s: public key not read: %+v", k.Name, k)
		}
		if strings.Contains(k.Name, "-enc") != k.Encrypted {
			t.Errorf("%s: encrypted = %v", k.Name, k.Encrypted)
		}
	}
}
