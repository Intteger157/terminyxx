package security

import (
	"errors"
	"strings"
	"sync"
	"testing"
	"time"
)

type memHash struct{ v string }

func (m *memHash) Load() (string, error) { return m.v, nil }
func (m *memHash) Save(h string) error   { m.v = h; return nil }

func TestLockLifecycle(t *testing.T) {
	store := &memHash{}
	var events []bool
	l, err := NewLock(store, func(locked bool) { events = append(events, locked) })
	if err != nil {
		t.Fatal(err)
	}
	if l.LockNow() || l.Status().Configured {
		t.Fatal("must not lock without a master password")
	}
	if err := l.SetPassword("", "abc"); !errors.Is(err, ErrPasswordTooWeak) {
		t.Fatalf("weak password accepted: %v", err)
	}
	if err := l.SetPassword("", "correct horse"); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(store.v, "$argon2id$") || strings.Contains(store.v, "correct horse") {
		t.Fatalf("bad stored hash: %q", store.v)
	}

	if !l.LockNow() || !l.Locked() {
		t.Fatal("LockNow failed")
	}
	if err := l.Unlock("nope"); !errors.Is(err, ErrWrongPassword) || !l.Locked() {
		t.Fatalf("wrong password unlocked: %v", err)
	}
	if err := l.Unlock("correct horse"); err != nil || l.Locked() {
		t.Fatalf("unlock: %v", err)
	}
	if len(events) != 2 || !events[0] || events[1] {
		t.Fatalf("change events: %v", events)
	}

	// A restart with a password set starts locked.
	l2, _ := NewLock(store, nil)
	if !l2.Locked() {
		t.Fatal("app should start locked")
	}
	// Changing requires the current password; removing unlocks.
	if err := l2.SetPassword("bad", ""); err == nil {
		t.Fatal("removed without the current password")
	}
	if err := l2.SetPassword("correct horse", ""); err != nil || l2.Locked() || store.v != "" {
		t.Fatalf("remove: %v", err)
	}
}

func TestLockThrottlesGuesses(t *testing.T) {
	store := &memHash{}
	l, _ := NewLock(store, nil)
	now := time.Unix(1000, 0)
	l.now = func() time.Time { return now }
	_ = l.SetPassword("", "secret!")
	l.LockNow()
	for i := 0; i < 3; i++ {
		_ = l.Unlock("x")
	}
	if err := l.Unlock("secret!"); err == nil || !strings.Contains(err.Error(), "too many") {
		t.Fatalf("expected throttling, got %v", err)
	}
	if l.Status().RetryAfterMs <= 0 {
		t.Fatal("RetryAfterMs not reported")
	}
	now = now.Add(2 * time.Second)
	if err := l.Unlock("secret!"); err != nil {
		t.Fatalf("unlock after delay: %v", err)
	}
}

func TestClipboardGuard(t *testing.T) {
	var mu sync.Mutex
	clip := ""
	get := func() (string, error) { mu.Lock(); defer mu.Unlock(); return clip, nil }
	set := func(s string) error { mu.Lock(); clip = s; mu.Unlock(); return nil }
	g := NewClipboardGuard(get, set, nil)

	_ = set("token=1")
	g.Schedule("token=1", time.Hour)
	if !g.ClearNow() || clip != "" {
		t.Fatal("clipboard not cleared")
	}

	// Something else was copied meanwhile: leave it alone.
	_ = set("token=2")
	g.Schedule("token=2", 10*time.Millisecond)
	_ = set("unrelated")
	time.Sleep(50 * time.Millisecond)
	if v, _ := get(); v != "unrelated" {
		t.Fatalf("unrelated clipboard wiped: %q", v)
	}
}

func TestFromSettingsJSON(t *testing.T) {
	c := FromSettingsJSON(`{"appearance":{},"security":{"masking":{"enabled":true},"clipboard":{"clearAfterSeconds":7},"osc52":"bogus"}}`)
	if !c.Masking.Enabled || c.Clipboard.ClearAfterSeconds != 30 || c.OSC52 != "prompt" || !c.SSH.ModernAlgorithmsOnly || !c.HideFromCapture {
		t.Fatalf("unexpected config: %+v", c)
	}
	if d := FromSettingsJSON(""); d != Defaults() {
		t.Fatalf("empty settings should give defaults: %+v", d)
	}
}

type memVault struct {
	enabled, hasKey bool
	dek             []byte
}

func (m *memVault) Unseal(d []byte)       { m.dek, m.hasKey = d, true }
func (m *memVault) Seal()                 { m.dek, m.hasKey = nil, false }
func (m *memVault) Migrate() error        { return nil }
func (m *memVault) Enable(d []byte) error { m.dek, m.hasKey, m.enabled = d, true, true; return nil }
func (m *memVault) Disable() error {
	if !m.hasKey {
		return errors.New("locked")
	}
	m.enabled = false
	return nil
}
func (m *memVault) SetEnabled(on bool) { m.enabled = on }

type memWrap struct{ v string }

func (m *memWrap) LoadWrap() (string, error) { return m.v, nil }
func (m *memWrap) SaveWrap(b string) error   { m.v = b; return nil }

func TestVaultFollowsMasterPassword(t *testing.T) {
	hs, ws, mv := &memHash{}, &memWrap{}, &memVault{}
	l, _ := NewLock(hs, nil)
	if err := l.AttachVault(mv, ws, func() bool { return false }); err != nil {
		t.Fatal(err)
	}
	if err := l.SetPassword("", "correct horse"); err != nil {
		t.Fatal(err)
	}
	if !mv.enabled || ws.v == "" || strings.Contains(ws.v, "correct") {
		t.Fatalf("vault not enabled: %+v wrap=%q", mv, ws.v)
	}
	dek := append([]byte(nil), mv.dek...)

	l.LockNow()
	if mv.hasKey {
		t.Fatal("key kept in memory while locked")
	}
	if err := l.Unlock("wrong"); err == nil || mv.hasKey {
		t.Fatal("wrong password unsealed")
	}
	if err := l.Unlock("correct horse"); err != nil || string(mv.dek) != string(dek) {
		t.Fatalf("unlock did not restore the key: %v", err)
	}

	// Changing the password keeps the data key.
	if err := l.SetPassword("correct horse", "battery staple"); err != nil {
		t.Fatal(err)
	}
	l.LockNow()
	if err := l.Unlock("battery staple"); err != nil || string(mv.dek) != string(dek) {
		t.Fatalf("key changed or unlock failed: %v", err)
	}

	// Removing it opens the stored passwords again.
	if err := l.SetPassword("battery staple", ""); err != nil {
		t.Fatal(err)
	}
	if mv.enabled || ws.v != "" {
		t.Fatalf("vault still on: %+v wrap=%q", mv, ws.v)
	}
}

func TestLegacyPasswordGetsVaultOnUnlock(t *testing.T) {
	hs, ws, mv := &memHash{}, &memWrap{}, &memVault{}
	l, _ := NewLock(hs, nil)
	_ = l.SetPassword("", "correct horse") // no vault attached yet: like an older version
	l2, _ := NewLock(hs, nil)
	_ = l2.AttachVault(mv, ws, func() bool { return false })
	if err := l2.Unlock("correct horse"); err != nil {
		t.Fatal(err)
	}
	if !mv.enabled || ws.v == "" {
		t.Fatal("existing master password did not enable the vault on unlock")
	}
}
