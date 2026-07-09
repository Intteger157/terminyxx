package connection

import (
	"io"
	"sync"

	"golang.org/x/crypto/ssh"
)

type PTYSession struct {
	mu      sync.Mutex
	session *ssh.Session
	stdin   io.WriteCloser
	closed  bool
}

func NewPTYSession(client *ssh.Client, emitter EventEmitter, connID string, cols, rows int) (*PTYSession, error) {
	session, err := client.NewSession()
	if err != nil {
		return nil, err
	}

	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED:  14400,
	}

	if err := session.RequestPty("xterm-256color", rows, cols, modes); err != nil {
		session.Close()
		return nil, err
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

	pty := &PTYSession{
		session: session,
		stdin:   stdin,
	}

	streamOutput := func(r io.Reader) {
		buf := make([]byte, 4096)
		for {
			n, readErr := r.Read(buf)
			if n > 0 {
				emitter.Emit("terminal:output:"+connID, string(buf[:n]))
			}
			if readErr != nil {
				return
			}
		}
	}

	go streamOutput(stdout)
	go streamOutput(stderr)

	go func() {
		_ = session.Wait()
		emitter.Emit("terminal:closed:"+connID)
	}()

	return pty, nil
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
