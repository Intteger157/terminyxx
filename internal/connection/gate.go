package connection

import "sync"

// maxPendingPerConn caps how much terminal output is buffered per connection
// while the app is locked. Past it the reader blocks, which lets SSH flow
// control pause the remote side instead of growing memory without bound.
const maxPendingPerConn = 8 << 20

// OutputGate holds terminal events back while the app is locked, so nothing
// new reaches the webview's DOM, and replays them in order on unlock.
// Sessions stay alive in the meantime.
type OutputGate struct {
	// rw is held for reading while an event is emitted live and for writing
	// while the gate is toggled, so no live event slips past a Lock.
	rw sync.RWMutex

	mu       sync.Mutex
	locked   bool
	released chan struct{}
	pending  map[string]*pendingEvents
	order    []string
}

type pendingEvents struct {
	fns  []func()
	size int
}

func NewOutputGate() *OutputGate {
	return &OutputGate{released: make(chan struct{}), pending: map[string]*pendingEvents{}}
}

// Send runs fn now, or queues it for connection id while locked. size is the
// payload size counted against the per-connection cap.
func (g *OutputGate) Send(id string, size int, fn func()) {
	for {
		g.rw.RLock()
		g.mu.Lock()
		if !g.locked {
			g.mu.Unlock()
			fn()
			g.rw.RUnlock()
			return
		}
		p := g.pending[id]
		if p == nil {
			p = &pendingEvents{}
			g.pending[id] = p
			g.order = append(g.order, id)
		}
		if p.size+size <= maxPendingPerConn || p.size == 0 {
			p.fns = append(p.fns, fn)
			p.size += size
			g.mu.Unlock()
			g.rw.RUnlock()
			return
		}
		wait := g.released
		g.mu.Unlock()
		g.rw.RUnlock()
		<-wait
	}
}

// SetLocked locks or unlocks the gate. Unlocking replays queued events.
func (g *OutputGate) SetLocked(locked bool) {
	g.rw.Lock()
	defer g.rw.Unlock()
	g.mu.Lock()
	if g.locked == locked {
		g.mu.Unlock()
		return
	}
	g.locked = locked
	if locked {
		g.released = make(chan struct{})
		g.mu.Unlock()
		return
	}
	pending, order := g.pending, g.order
	g.pending, g.order = map[string]*pendingEvents{}, nil
	close(g.released)
	g.mu.Unlock()
	// Still holding rw: queued events go out before any live ones.
	for _, id := range order {
		for _, fn := range pending[id].fns {
			fn()
		}
	}
}

// Locked reports whether the gate is holding events back.
func (g *OutputGate) Locked() bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.locked
}
