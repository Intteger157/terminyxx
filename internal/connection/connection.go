package connection

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
	"golang.org/x/text/encoding"
	"terminyxx/internal/recording"
)

const (
	dialTimeout       = 15 * time.Second
	keepaliveInterval = 30 * time.Second
	// keepaliveTimeout: a reply that doesn't come in time counts as missed.
	// Without it a half-open TCP connection blocks SendRequest for as long as
	// the OS keeps retransmitting, and the tab never shows "disconnected".
	keepaliveTimeout = 15 * time.Second
	keepaliveMaxMiss = 3
)

// handshakeTimeout bounds the SSH handshake and authentication. It is
// longer than dialTimeout because agent keys may wait for a confirmation or
// a hardware key touch. A variable so tests can shorten it.
var handshakeTimeout = 60 * time.Second

// errHandshakeTimeout is returned when the server accepts the TCP connection
// but never completes the SSH handshake.
var errHandshakeTimeout = errors.New("ssh: the server did not complete the handshake in time")

// ManagedConnection is one SSH client shared by the tab's shell and SFTP.
type ManagedConnection struct {
	mu      sync.RWMutex
	ID      string
	client  *ssh.Client
	pty     *PTYSession
	sftp    *SFTPBridge
	state   ConnectionState
	emitter EventEmitter
	stop    chan struct{}
	once    sync.Once

	gate *OutputGate
	mask func() MaskOptions
	// agentConn serves forwarded agent requests; nil without forwarding.
	agentConn io.Closer
	// x11 relays forwarded X11 connections; nil without forwarding.
	x11 *x11Forwarder

	tunnelSet *tunnelSet

	rec        atomic.Pointer[recording.Recorder]
	monitor    monitorState
	sizeMu     sync.Mutex
	cols, rows int // last known terminal size, for new recordings
	// jumps are the intermediate SSH clients of a ProxyJump chain, closed
	// together with the connection.
	jumps []*ssh.Client
	// shellExited is set when the remote shell ended on its own (`exit`,
	// logout), as opposed to the network or the server going away.
	shellExited atomic.Bool
	// charset is the server's terminal encoding (nil = UTF-8); startup is
	// typed into the shell right after it starts.
	charset encoding.Encoding
	startup string
}

// dialSSH connects to req, going through req.Jump (ProxyJump) first. It
// returns the final client plus the intermediate clients, which must stay
// open for as long as the final one is used.
func dialSSH(req ConnectRequest, hostKeys *HostKeyStore, policy Policy, report *SSHDiagnostic) (*ssh.Client, []*ssh.Client, error) {
	var jumps []*ssh.Client
	var via *ssh.Client
	for _, hop := range req.Jump {
		hop.Jump = nil
		// A host key the user confirmed applies to whichever hop presents it.
		hop.AcceptHostKey, hop.ReplaceHostKey = req.AcceptHostKey, req.ReplaceHostKey
		c, err := dialHop(hop, via, hostKeys, policy, report, true)
		if err != nil {
			closeJumpClients(jumps)
			return nil, nil, err
		}
		jumps = append(jumps, c)
		via = c
	}
	client, err := dialHop(req, via, hostKeys, policy, report, false)
	if err != nil {
		closeJumpClients(jumps)
		return nil, nil, err
	}
	return client, jumps, nil
}

func closeJumpClients(jumps []*ssh.Client) {
	for i := len(jumps) - 1; i >= 0; i-- {
		_ = jumps[i].Close()
	}
}

// dialHop connects to one host, directly or through the via client.
func dialHop(req ConnectRequest, via *ssh.Client, hostKeys *HostKeyStore, policy Policy, report *SSHDiagnostic, jump bool) (*ssh.Client, error) {
	port := req.Port
	if port == 0 {
		port = 22
	}
	addr := net.JoinHostPort(req.Host, strconv.Itoa(port))
	check := func(stage, failure string) {
		report.Checks = append(report.Checks, SSHCheck{Address: addr, Jump: jump, Stage: stage, Failure: failure})
	}

	auths, cleanup, err := buildAuthMethods(req)
	if err != nil {
		failure := "Could not load SSH credentials"
		if strings.HasPrefix(err.Error(), PassphraseRequiredPrefix+"|") {
			failure = "The private key needs a passphrase"
		}
		check("Credentials", failure)
		return nil, err
	}
	defer cleanup()

	config := &ssh.ClientConfig{
		User:    req.Username,
		Auth:    auths,
		Timeout: dialTimeout,
	}
	if hostKeys != nil {
		cb, algos, err := hostKeys.Callback(addr, req.AcceptHostKey, req.ReplaceHostKey)
		if err != nil {
			check("Host key", "Could not read trusted host keys")
			return nil, err
		}
		config.HostKeyCallback = cb
		config.HostKeyAlgorithms = algos
	} else {
		config.HostKeyCallback = ssh.InsecureIgnoreHostKey()
	}
	if policy.StrictAlgorithms && !req.AllowLegacyAlgorithms {
		applyAlgorithms(config, config.HostKeyAlgorithms)
	} else {
		legacyAlgorithms(config)
	}

	var conn net.Conn
	stage := "TCP connection"
	if via == nil {
		if req.Proxy.Type == ProxyCommand {
			stage = "Start proxy command"
		} else if req.Proxy.Type != ProxyNone {
			stage = "Proxy connection"
		}
		conn, err = dialDirect(req.Host, port, req.Username, req.Proxy)
	} else {
		stage = "TCP via jump host"
		ctx, cancel := context.WithTimeout(context.Background(), dialTimeout)
		conn, err = via.DialContext(ctx, "tcp", addr)
		cancel()
		if err != nil {
			err = fmt.Errorf("jump host cannot reach %s: %w", addr, err)
		}
	}
	if err != nil {
		var dns *net.DNSError
		if errors.As(err, &dns) {
			if stage == "Proxy connection" {
				stage = "Proxy DNS lookup"
			} else {
				stage = "DNS lookup"
			}
			failure := "Could not resolve the hostname"
			if dns.IsTimeout {
				failure = "DNS lookup timed out"
			}
			check(stage, failure)
		} else {
			check(stage, tcpDiagnostic(err))
		}
		return nil, err
	}
	check(stage, "")

	var keyVerified atomic.Bool
	verify := config.HostKeyCallback
	config.HostKeyCallback = func(host string, remote net.Addr, key ssh.PublicKey) error {
		if err := verify(host, remote, key); err != nil {
			return err
		}
		keyVerified.Store(true)
		return nil
	}
	// ssh.Dial only bounds the TCP dial. Bound the SSH handshake as well.
	client, err := handshake(conn, addr, config)
	if err != nil {
		var hk *HostKeyError
		if errors.As(err, &hk) {
			failure := "The server's host key is not trusted yet"
			if hk.Mismatch {
				failure = "The server's host key has changed"
			}
			check("Host key", failure)
			return nil, hk
		}
		if cc, ok := conn.(*cmdConn); ok && !strings.Contains(err.Error(), "ProxyCommand") {
			if msg := cc.stderr.String(); msg != "" {
				err = fmt.Errorf("%w (ProxyCommand: %s)", err, msg)
			}
		}
		if policy.StrictAlgorithms && !req.AllowLegacyAlgorithms && strings.Contains(err.Error(), "no common algorithm") {
			check("SSH negotiation", "No compatible algorithms under the current SSH policy")
			return nil, fmt.Errorf("%s|%w", LegacyAlgorithmsPrefix, err)
		}
		if keyVerified.Load() {
			check("Host key", "")
			failure := "Could not complete SSH login"
			if strings.Contains(err.Error(), "unable to authenticate") {
				failure = "The server rejected the offered login methods"
			} else if errors.Is(err, errHandshakeTimeout) {
				failure = "SSH login timed out"
			}
			check("Authentication", failure)
		} else if errors.Is(err, errHandshakeTimeout) {
			check("SSH negotiation", "SSH handshake timed out")
		} else {
			check("SSH negotiation", "Could not complete the SSH handshake")
		}
		return nil, err
	}
	check("Host key", "")
	check("Authentication", "")
	return client, nil
}

// handshake runs the SSH handshake on conn, closing it after
// handshakeTimeout. A timer is used instead of SetDeadline because the
// channel connections of a jump host don't support deadlines.
func handshake(conn net.Conn, addr string, config *ssh.ClientConfig) (*ssh.Client, error) {
	var timedOut atomic.Bool
	timer := time.AfterFunc(handshakeTimeout, func() {
		timedOut.Store(true)
		_ = conn.Close()
	})
	ncc, chans, reqs, err := ssh.NewClientConn(conn, addr, config)
	if !timer.Stop() && timedOut.Load() {
		if err == nil {
			_ = ncc.Close()
		}
		return nil, errHandshakeTimeout
	}
	if err != nil {
		_ = conn.Close()
		return nil, err
	}
	return ssh.NewClient(ncc, chans, reqs), nil
}

// LegacyAlgorithmsPrefix marks a handshake that failed because the server
// only offers algorithms the "modern algorithms only" setting disables.
const LegacyAlgorithmsPrefix = "LEGACY_ALGORITHMS_REQUIRED"

func newManagedConnection(req ConnectRequest, m *ConnectionManager, report *SSHDiagnostic) (*ManagedConnection, error) {
	policy := m.Policy()
	charset, err := lookupCharset(req.Encoding)
	if err != nil {
		return nil, err
	}
	client, jumps, err := dialSSH(req, m.hostKeys, policy, report)
	if err != nil {
		return nil, err
	}
	c := &ManagedConnection{
		ID:      req.ID,
		client:  client,
		jumps:   jumps,
		state:   StateConnected,
		emitter: m.emitter,
		stop:    make(chan struct{}),
		gate:    m.gate,
		mask:    m.maskOptions,
		charset: charset,
		startup: startupInput(req.Startup),
	}
	if req.AgentForwarding && policy.AllowAgentForwarding {
		if conn := dialAgent(); conn != nil {
			if err := agent.ForwardToAgent(client, agent.NewClient(conn)); err == nil {
				c.agentConn = conn
			} else {
				conn.Close()
			}
		}
	}
	if req.X11 && policy.AllowX11 {
		if f, err := startX11(client, policy.X11Display); err == nil {
			c.x11 = f
		} else {
			log.Printf("x11: %v", err)
		}
	}
	go c.keepalive()
	return c, nil
}

func (c *ManagedConnection) keepalive() {
	t := time.NewTicker(keepaliveInterval)
	defer t.Stop()
	missed := 0
	for {
		select {
		case <-c.stop:
			return
		case <-t.C:
			client := c.Client()
			if client == nil {
				return
			}
			// Buffered: a request still blocked when we give up on it exits
			// once the reply arrives or client.Close below fails it.
			reply := make(chan error, 1)
			go func() {
				_, _, err := client.SendRequest("keepalive@openssh.com", true, nil)
				reply <- err
			}()
			var err error
			select {
			case err = <-reply:
			case <-time.After(keepaliveTimeout):
				err = errors.New("keepalive timeout")
			case <-c.stop:
				return
			}
			if err != nil {
				missed++
				if missed >= keepaliveMaxMiss {
					_ = client.Close()
					return
				}
			} else {
				missed = 0
			}
		}
	}
}

// Wait blocks until the underlying SSH connection is gone.
func (c *ManagedConnection) Wait() {
	if client := c.Client(); client != nil {
		_ = client.Wait()
	}
}

func (c *ManagedConnection) State() ConnectionState {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.state
}

func (c *ManagedConnection) Client() *ssh.Client {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.client
}

// StartShell opens the PTY once; later calls only resize it. The frontend
// calls it after subscribing to output so the login banner isn't lost.
func (c *ManagedConnection) StartShell(cols, rows int) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.client == nil {
		return errors.New("not connected")
	}
	if c.pty != nil {
		c.noteSize(cols, rows)
		return c.pty.Resize(cols, rows)
	}
	c.noteSize(cols, rows)
	client := c.client
	opts := ptyOptions{gate: c.gate, mask: c.mask, forwardAgent: c.agentConn != nil, x11: c.x11, recorder: c.rec.Load, charset: c.charset}
	pty, err := NewPTYSession(client, c.emitter, c.ID, cols, rows, opts, func(err error) {
		// Shell exited (e.g. `exit`): drop the whole connection.
		var exitErr *ssh.ExitError
		if err == nil || errors.As(err, &exitErr) {
			c.shellExited.Store(true)
		}
		_ = client.Close()
	})
	if err != nil {
		return fmt.Errorf("start shell: %w", err)
	}
	c.pty = pty
	if c.startup != "" {
		// The shell reads it as type-ahead once its prompt is up.
		_, _ = pty.Write(encodeInput([]byte(c.startup), c.charset))
	}
	return nil
}

// maxStartup caps the commands typed after login.
const maxStartup = 8 << 10

// startupInput turns the saved startup commands into keystrokes: one line
// per command, each ended with Enter; blank lines are dropped.
func startupInput(s string) string {
	if len(s) > maxStartup {
		s = s[:maxStartup]
	}
	var b strings.Builder
	for _, line := range strings.Split(strings.ReplaceAll(s, "\r\n", "\n"), "\n") {
		line = strings.TrimRight(line, "\r")
		if strings.TrimSpace(line) == "" {
			continue
		}
		b.WriteString(line)
		b.WriteByte('\r')
	}
	return b.String()
}

func (c *ManagedConnection) WriteInput(data string) error {
	c.mu.RLock()
	pty := c.pty
	c.mu.RUnlock()
	if pty == nil {
		return errors.New("shell not started")
	}
	_, err := pty.Write(encodeInput([]byte(data), c.charset))
	return err
}

func (c *ManagedConnection) ResizePTY(cols, rows int) error {
	c.mu.RLock()
	pty := c.pty
	c.mu.RUnlock()
	if pty == nil {
		return nil
	}
	c.noteSize(cols, rows)
	return pty.Resize(cols, rows)
}

// SFTP returns the SFTP client, creating it over the existing SSH
// connection on first use.
func (c *ManagedConnection) SFTP() (*SFTPBridge, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.sftp != nil {
		return c.sftp, nil
	}
	if c.client == nil {
		return nil, errors.New("not connected")
	}
	bridge, err := NewSFTPBridge(c.client)
	if err != nil {
		return nil, err
	}
	c.sftp = bridge
	return bridge, nil
}

func (c *ManagedConnection) Close() error {
	c.once.Do(func() { close(c.stop) })
	c.StopRecording()
	c.closeTunnels()

	c.mu.Lock()
	defer c.mu.Unlock()
	if c.pty != nil {
		_ = c.pty.Close()
		c.pty = nil
	}
	if c.sftp != nil {
		_ = c.sftp.Close()
		c.sftp = nil
	}
	c.state = StateDisconnected
	if c.agentConn != nil {
		_ = c.agentConn.Close()
		c.agentConn = nil
	}
	if c.client != nil {
		err := c.client.Close()
		c.client = nil
		closeJumpClients(c.jumps)
		c.jumps = nil
		return err
	}
	return nil
}

// noteSize remembers the terminal size and logs it into a running recording.
// The caller may hold c.mu, so the size fields are only touched atomically
// through the recorder pointer and a small separate lock-free update.
func (c *ManagedConnection) noteSize(cols, rows int) {
	if cols <= 0 || rows <= 0 {
		return
	}
	c.sizeMu.Lock()
	changed := c.cols != cols || c.rows != rows
	c.cols, c.rows = cols, rows
	c.sizeMu.Unlock()
	if changed {
		if r := c.rec.Load(); r != nil {
			r.Resize(cols, rows)
		}
	}
}

// StartRecording begins saving the session to dir and returns the file name.
func (c *ManagedConnection) StartRecording(dir, title string) (string, error) {
	if c.rec.Load() != nil {
		return "", errors.New("already recording")
	}
	c.sizeMu.Lock()
	cols, rows := c.cols, c.rows
	c.sizeMu.Unlock()
	r, name, err := recording.Start(dir, title, cols, rows)
	if err != nil {
		return "", err
	}
	if !c.rec.CompareAndSwap(nil, r) {
		r.Close()
		return "", errors.New("already recording")
	}
	return name, nil
}

// StopRecording ends the recording, if any.
func (c *ManagedConnection) StopRecording() {
	if r := c.rec.Swap(nil); r != nil {
		r.Close()
	}
}

// Recording reports whether the session is being recorded.
func (c *ManagedConnection) Recording() bool { return c.rec.Load() != nil }
