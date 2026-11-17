package store

import (
	"errors"
	"strings"
	"testing"
)

func TestVaultSealsAndOpens(t *testing.T) {
	inner := NewMemorySecrets()
	v := NewVault(inner)
	keys := []string{"ssh:a"}
	v.SetKeyLister(func() ([]string, error) { return keys, nil })

	if err := v.Set("ssh:a", "x"); !errors.Is(err, ErrSecretLocked) {
		t.Fatalf("write before SetEnabled must fail, got %v", err)
	}
	v.SetEnabled(false)
	must(t, v.Set("ssh:a", "hunter2"))
	if raw, _ := inner.Get("ssh:a"); raw != "hunter2" {
		t.Fatalf("plain mode must store as is: %q", raw)
	}

	dek := make([]byte, 32)
	dek[0] = 7
	must(t, v.Enable(dek))
	raw, _ := inner.Get("ssh:a")
	if !strings.HasPrefix(raw, sealedPrefix) || strings.Contains(raw, "hunter2") {
		t.Fatalf("existing value not sealed: %q", raw)
	}
	if got, err := v.Get("ssh:a"); err != nil || got != "hunter2" {
		t.Fatalf("Get = %q, %v", got, err)
	}

	// A value cannot be moved to another entry.
	_ = inner.Set("ssh:b", raw)
	if _, err := v.Get("ssh:b"); err == nil {
		t.Fatal("sealed value accepted under another key")
	}

	// Locked: the entry is known to exist but cannot be read or written.
	v.Seal()
	if !v.Has("ssh:a") {
		t.Fatal("Has must work while sealed")
	}
	if _, err := v.Get("ssh:a"); !errors.Is(err, ErrSecretLocked) {
		t.Fatalf("Get while sealed: %v", err)
	}
	if err := v.Set("ssh:a", "y"); !errors.Is(err, ErrSecretLocked) {
		t.Fatalf("Set while sealed: %v", err)
	}

	v.Unseal(dek)
	must(t, v.Set("ssh:a", "new"))
	if got, _ := v.Get("ssh:a"); got != "new" {
		t.Fatalf("Get = %q", got)
	}
	raw, _ = inner.Get("ssh:a")
	if !strings.HasPrefix(raw, sealedPrefix) {
		t.Fatal("new value written in plain text while enabled")
	}

	must(t, v.Disable())
	if raw, _ := inner.Get("ssh:a"); raw != "new" {
		t.Fatalf("Disable must open values: %q", raw)
	}
}
