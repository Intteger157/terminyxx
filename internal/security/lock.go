package security

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/argon2"
)

// The master password is stored as an Argon2id hash (PHC string format).
const (
	argonTime    = 3
	argonMemory  = 64 * 1024 // KiB
	argonThreads = 4
	argonKeyLen  = 32
	minPassword  = 6
)

var (
	ErrWrongPassword   = errors.New("wrong password")
	ErrNotConfigured   = errors.New("no master password is set")
	ErrPasswordTooWeak = fmt.Errorf("the master password must be at least %d characters", minPassword)
)

// HashStore persists the master password hash ("" = none). The app backs it
// with the settings table.
type HashStore interface {
	Load() (string, error)
	Save(hash string) error
}

// LockStatus is what the frontend needs to draw the lock screen.
type LockStatus struct {
	// Configured: a master password is set, so the app can lock.
	Configured bool `json:"configured"`
	Locked     bool `json:"locked"`
	// RetryAfterMs is how long the unlock form must wait after failed attempts.
	RetryAfterMs int64 `json:"retryAfterMs"`
}

// Lock holds the app's locked state and verifies the master password.
// Failed attempts are throttled with an exponential delay.
type Lock struct {
	mu       sync.Mutex
	store    HashStore
	hash     string
	locked   bool
	failures int
	retryAt  time.Time
	now      func() time.Time
	// onChange runs (without the lock held) after every lock/unlock.
	onChange func(locked bool)
}

// NewLock loads the stored hash. If a master password is set, the app
// starts locked.
func NewLock(store HashStore, onChange func(bool)) (*Lock, error) {
	l := &Lock{store: store, now: time.Now, onChange: onChange}
	h, err := store.Load()
	if err != nil {
		return l, err
	}
	l.hash = h
	l.locked = h != ""
	return l, nil
}

func (l *Lock) Status() LockStatus {
	l.mu.Lock()
	defer l.mu.Unlock()
	s := LockStatus{Configured: l.hash != "", Locked: l.locked}
	if d := l.retryAt.Sub(l.now()); d > 0 {
		s.RetryAfterMs = d.Milliseconds()
	}
	return s
}

func (l *Lock) Locked() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.locked
}

// LockNow locks the app. It does nothing without a master password.
func (l *Lock) LockNow() bool {
	l.mu.Lock()
	if l.hash == "" || l.locked {
		locked := l.locked
		l.mu.Unlock()
		return locked
	}
	l.locked = true
	l.mu.Unlock()
	l.notify(true)
	return true
}

// Unlock verifies password and unlocks the app.
func (l *Lock) Unlock(password string) error {
	l.mu.Lock()
	if err := l.checkLocked(password); err != nil {
		l.mu.Unlock()
		return err
	}
	wasLocked := l.locked
	l.locked = false
	l.mu.Unlock()
	if wasLocked {
		l.notify(false)
	}
	return nil
}

// UnlockVerified unlocks after the OS confirmed the user (biometrics).
func (l *Lock) UnlockVerified() {
	l.mu.Lock()
	wasLocked := l.locked
	l.locked = false
	l.failures = 0
	l.retryAt = time.Time{}
	l.mu.Unlock()
	if wasLocked {
		l.notify(false)
	}
}

// Verify checks password without changing the lock state (e.g. before
// turning on biometrics or removing the password).
func (l *Lock) Verify(password string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.checkLocked(password)
}

// checkLocked verifies password with throttling. Callers hold l.mu.
func (l *Lock) checkLocked(password string) error {
	if l.hash == "" {
		return ErrNotConfigured
	}
	if d := l.retryAt.Sub(l.now()); d > 0 {
		return fmt.Errorf("too many attempts, try again in %d s", int(d.Seconds()+0.999))
	}
	ok, err := verifyHash(l.hash, password)
	if err != nil {
		return err
	}
	if !ok {
		l.failures++
		if l.failures >= 3 {
			// 1 s, 2 s, 4 s … capped at 60 s.
			delay := time.Second << min(l.failures-3, 6)
			if delay > time.Minute {
				delay = time.Minute
			}
			l.retryAt = l.now().Add(delay)
		}
		return ErrWrongPassword
	}
	l.failures = 0
	l.retryAt = time.Time{}
	return nil
}

// SetPassword sets, changes (current must match) or, with next == "",
// removes the master password. Removing it also unlocks the app.
func (l *Lock) SetPassword(current, next string) error {
	l.mu.Lock()
	if l.hash != "" {
		if err := l.checkLocked(current); err != nil {
			l.mu.Unlock()
			return err
		}
	}
	if next != "" && len([]rune(next)) < minPassword {
		l.mu.Unlock()
		return ErrPasswordTooWeak
	}
	hash := ""
	if next != "" {
		var err error
		if hash, err = hashPassword(next); err != nil {
			l.mu.Unlock()
			return err
		}
	}
	if err := l.store.Save(hash); err != nil {
		l.mu.Unlock()
		return err
	}
	l.hash = hash
	wasLocked := l.locked
	if hash == "" {
		l.locked = false
	}
	l.mu.Unlock()
	if wasLocked && hash == "" {
		l.notify(false)
	}
	return nil
}

func (l *Lock) notify(locked bool) {
	if l.onChange != nil {
		l.onChange(locked)
	}
}

func hashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	b64 := base64.RawStdEncoding
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argonMemory, argonTime, argonThreads, b64.EncodeToString(salt), b64.EncodeToString(key)), nil
}

func verifyHash(encoded, password string) (bool, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false, errors.New("unsupported password hash")
	}
	var version int
	var m uint32
	var t uint32
	var p uint8
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return false, errors.New("unsupported password hash version")
	}
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &m, &t, &p); err != nil {
		return false, errors.New("corrupt password hash")
	}
	b64 := base64.RawStdEncoding
	salt, err1 := b64.DecodeString(parts[4])
	want, err2 := b64.DecodeString(parts[5])
	if err1 != nil || err2 != nil {
		return false, errors.New("corrupt password hash")
	}
	got := argon2.IDKey([]byte(password), salt, t, m, p, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}
