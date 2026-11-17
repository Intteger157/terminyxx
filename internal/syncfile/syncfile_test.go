package syncfile

import (
	"bytes"
	"errors"
	"testing"
)

func TestSealOpen(t *testing.T) {
	plain := []byte(`{"hosts":["a","b"]}`)
	sealed, err := Seal(plain, "correct horse")
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(sealed, []byte("hosts")) {
		t.Fatal("plaintext visible in sealed data")
	}
	got, err := Open(sealed, "correct horse")
	if err != nil || !bytes.Equal(got, plain) {
		t.Fatalf("open: %q %v", got, err)
	}
	if _, err := Open(sealed, "wrong horse!"); !errors.Is(err, ErrBadPassphrase) {
		t.Fatalf("wrong passphrase: %v", err)
	}
	// Tampering with the header or body must be detected.
	for _, i := range []int{len(magic) + 12, len(sealed) - 1} {
		bad := append([]byte(nil), sealed...)
		bad[i] ^= 1
		if _, err := Open(bad, "correct horse"); err == nil {
			t.Fatalf("tampered byte %d accepted", i)
		}
	}
	if _, err := Seal(plain, "short"); err == nil {
		t.Fatal("short passphrase accepted")
	}
	if _, err := Open([]byte("garbage"), "correct horse"); err == nil {
		t.Fatal("garbage accepted")
	}
}
