package connection

import (
	"io"
	"sync"
	"unicode/utf8"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
)

// ptyOptions are the connection-level settings a shell session needs.
type ptyOptions struct {
	// gate holds output back while the app is locked (nil: never).
	gate *OutputGate
	// mask returns the current masking options (nil: no masking).
	mask func() MaskOptions
	// forwardAgent requests agent forwarding for the session.
	forwardAgent bool
}

type PTYSession struct {
	mu      sync.Mutex
	session *ssh.Session
	stdin   io.WriteCloser
	closed  bool
	done    chan struct{}
}

// NewPTYSession opens an interactive shell. Output is emitted as
// terminal:output:{connID}; onExit runs once the shell has ended.
func NewPTYSession(client *ssh.Client, emitter EventEmitter, connID string, cols, rows int, opts ptyOptions, onExit func()) (*PTYSession, error) {
	if cols <= 0 {
		cols = 120
	}
	if rows <= 0 {
		rows = 30
	}

	session, err := client.NewSession()
	if err != nil {
		return nil, err
	}

	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
		ssh.IUTF8:         1,
	}
	if err := session.RequestPty("xterm-256color", rows, cols, modes); err != nil {
		session.Close()
		return nil, err
	}
	_ = session.Setenv("LANG", "en_US.UTF-8")
	_ = session.Setenv("COLORTERM", "truecolor")
	if opts.forwardAgent {
		_ = agent.RequestAgentForwarding(session)
	}

	stdin, err := session.StdinPipe()
	if err != nil {
		session.Close()
		return nil, err
	}
	stdout, err := session.StdoutPipe()
	if err != nil {
		session.Close()
		return nil, err
	}
	stderr, err := session.StderrPipe()
	if err != nil {
		session.Close()
		return nil, err
	}
	if err := session.Shell(); err != nil {
		session.Close()
		return nil, err
	}

	p := &PTYSession{session: session, stdin: stdin, done: make(chan struct{})}

	// send emits through the lock gate, so output produced while the app is
	// locked is queued (in order) instead of reaching the webview.
	send := func(event string, payload ...interface{}) {
		if opts.gate == nil {
			emitter.Emit(event, payload...)
			return
		}
		size := 0
		if len(payload) > 0 {
			if s, ok := payload[0].(string); ok {
				size = len(s)
			}
		}
		opts.gate.Send(connID, size, func() { emitter.Emit(event, payload...) })
	}

	var emitMu sync.Mutex
	raw := func(s string) { send("terminal:output:"+connID, s) }
	var masker *OutputMasker
	if opts.mask != nil {
		masker = NewOutputMasker(opts.mask, raw)
	}
	emit := func(s string) {
		if masker != nil {
			masker.Write(s) // serialized by the masker's own lock
			return
		}
		emitMu.Lock()
		raw(s)
		emitMu.Unlock()
	}

	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); streamUTF8(stdout, emit) }()
	go func() { defer wg.Done(); streamUTF8(stderr, emit) }()

	go func() {
		_ = session.Wait()
		wg.Wait()
		if masker != nil {
			masker.Flush()
		}
		close(p.done)
		send("terminal:closed:" + connID)
		if onExit != nil {
			onExit()
		}
	}()

	return p, nil
}

// streamUTF8 forwards r to emit without splitting multi-byte UTF-8
// characters across chunks (which would garble e.g. Cyrillic output).
func streamUTF8(r io.Reader, emit func(string)) {
	buf := make([]byte, 32*1024)
	pending := 0
	for {
		n, err := r.Read(buf[pending:])
		n += pending
		pending = 0
		if n > 0 {
			cut := incompleteTail(buf[:n])
			if cut < n {
				emit(string(buf[:n-cut]))
			}
			if cut > 0 {
				copy(buf, buf[n-cut:n])
				pending = cut
			}
		}
		if err != nil {
			if pending > 0 {
				emit(string(buf[:pending]))
			}
			return
		}
	}
}

// incompleteTail returns how many trailing bytes of b form the start of a
// UTF-8 sequence that has not been fully received yet.
func incompleteTail(b []byte) int {
	for i := 1; i <= utf8.UTFMax-1 && i <= len(b); i++ {
		c := b[len(b)-i]
		if c < 0x80 {
			return 0 // ASCII: nothing pending
		}
		if c >= 0xC0 { // leading byte
			var need int
			switch {
			case c >= 0xF0:
				need = 4
			case c >= 0xE0:
				need = 3
			default:
				need = 2
			}
			if need > i {
				return i
			}
			return 0
		}
	}
	return 0
}

func (p *PTYSession) Write(data []byte) (int, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.closed {
		return 0, io.ErrClosedPipe
	}
	return p.stdin.Write(data)
}

func (p *PTYSession) Resize(cols, rows int) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.closed {
		return io.ErrClosedPipe
	}
	return p.session.WindowChange(rows, cols)
}

func (p *PTYSession) Close() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.closed {
		return nil
	}
	p.closed = true
	_ = p.stdin.Close()
	return p.session.Close()
}
