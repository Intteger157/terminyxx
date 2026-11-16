package security

import (
	"crypto/sha256"
	"sync"
	"time"
)

// ClipboardGuard clears the system clipboard some time after the app put
// sensitive text on it, but only if the clipboard still holds that text:
// it compares hashes, so something the user copied later (in any app) is
// never wiped. The text itself isn't kept, only its SHA-256.
type ClipboardGuard struct {
	mu    sync.Mutex
	get   func() (string, error)
	set   func(string) error
	hash  [32]byte
	armed bool
	timer *time.Timer
	// onCleared runs after the clipboard was actually cleared.
	onCleared func()
}

func NewClipboardGuard(get func() (string, error), set func(string) error, onCleared func()) *ClipboardGuard {
	return &ClipboardGuard{get: get, set: set, onCleared: onCleared}
}

// Schedule arms (or re-arms) the timer for text. A newer copy replaces the
// pending one.
func (g *ClipboardGuard) Schedule(text string, after time.Duration) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.timer != nil {
		g.timer.Stop()
	}
	g.hash = sha256.Sum256([]byte(text))
	g.armed = true
	g.timer = time.AfterFunc(after, func() { g.ClearNow() })
}

// Cancel forgets a pending clear (e.g. a later, non-sensitive copy).
func (g *ClipboardGuard) Cancel() {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.timer != nil {
		g.timer.Stop()
		g.timer = nil
	}
	g.armed = false
}

// ClearNow clears the clipboard if it still holds the scheduled text. It is
// also called on shutdown so a secret doesn't outlive the app.
func (g *ClipboardGuard) ClearNow() bool {
	g.mu.Lock()
	if !g.armed {
		g.mu.Unlock()
		return false
	}
	g.armed = false
	g.timer = nil
	want := g.hash
	g.mu.Unlock()

	cur, err := g.get()
	if err != nil || sha256.Sum256([]byte(cur)) != want {
		return false
	}
	if g.set("") != nil {
		return false
	}
	if g.onCleared != nil {
		g.onCleared()
	}
	return true
}
