package connection

import (
	"errors"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
)

const (
	dialTimeout       = 15 * time.Second
	keepaliveInterval = 30 * time.Second
	keepaliveMaxMiss  = 3
)

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

	tunnelSet *tunnelSet
	// jumps are the intermediate SSH clients of a ProxyJump chain, closed
	// together with the connection.
	jumps []*ssh.Client
}

// dialSSH connects to req, going through req.Jump (ProxyJump) first. It
// returns the final client plus the intermediate clients, which must stay
// open for as long as the final one is used.
func dialSSH(req ConnectRequest, hostKeys *HostKeyStore, policy Policy) (*ssh.Client, []*ssh.Client, error) {
	var jumps []*ssh.Client
	var via *ssh.Client
	closeJumps := func() {
		for i := len(jumps) - 1; i >= 0; i-- {
			_ = jumps[i].Close()
		}
	}
	for _, hop := range req.Jump {
		hop.Jump = nil
		// A host key the user confirmed applies to whichever hop presents it.
		hop.AcceptHostKey, hop.ReplaceHostKey = req.AcceptHostKey, req.ReplaceHostKey
		c, err := dialHop(hop, via, hostKeys, policy)
		if err != nil {
			closeJumps()
			return nil, nil, err
		}
		jumps = append(jumps, c)
		via = c
	}
	client, err := dialHop(req, via, hostKeys, policy)
	if err != nil {
		closeJumps()
		return nil, nil, err
	}
	return client, jumps, nil
}

// dialHop connects to one host, directly or through the via client.
func dialHop(req ConnectRequest, via *ssh.Client, hostKeys *HostKeyStore, policy Policy) (*ssh.Client, error) {
	port := req.Port
	if port == 0 {
		port = 22
	}
	addr := net.JoinHostPort(req.Host, strconv.Itoa(port))

	auths, cleanup, err := buildAuthMethods(req)
	if err != nil {
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

	var client *ssh.Client
	if via == nil {
		client, err = ssh.Dial("tcp", addr, config)
	} else {
		client, err = dialThrough(via, addr, config)
	}
	if err != nil {
		var hk *HostKeyError
		if errors.As(err, &hk) {
			return nil, hk
		}
		if policy.StrictAlgorithms && !req.AllowLegacyAlgorithms && strings.Contains(err.Error(), "no common algorithm") {
			return nil, fmt.Errorf("%s|%w", LegacyAlgorithmsPrefix, err)
		}
		return nil, err
	}
	return client, nil
}

// dialThrough opens an SSH session to addr over a channel of the via client.
func dialThrough(via *ssh.Client, addr string, config *ssh.ClientConfig) (*ssh.Client, error) {
	conn, err := via.Dial("tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("jump host cannot reach %s: %w", addr, err)
	}
	_ = conn.SetDeadline(time.Now().Add(dialTimeout))
	ncc, chans, reqs, err := ssh.NewClientConn(conn, addr, config)
	if err != nil {
		_ = conn.Close()
		return nil, err
	}
	_ = conn.SetDeadline(time.Time{})
	return ssh.NewClient(ncc, chans, reqs), nil
}

// LegacyAlgorithmsPrefix marks a handshake that failed because the server
// only offers algorithms the "modern algorithms only" setting disables.
const LegacyAlgorithmsPrefix = "LEGACY_ALGORITHMS_REQUIRED"

func newManagedConnection(req ConnectRequest, m *ConnectionManager) (*ManagedConnection, error) {
	policy := m.Policy()
	client, jumps, err := dialSSH(req, m.hostKeys, policy)
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
			if _, _, err := client.SendRequest("keepalive@openssh.com", true, nil); err != nil {
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
		return c.pty.Resize(cols, rows)
	}
	client := c.client
	opts := ptyOptions{gate: c.gate, mask: c.mask, forwardAgent: c.agentConn != nil}
	pty, err := NewPTYSession(client, c.emitter, c.ID, cols, rows, opts, func() {
		// Shell exited (e.g. `exit`): drop the whole connection.
		_ = client.Close()
	})
	if err != nil {
		return fmt.Errorf("start shell: %w", err)
	}
	c.pty = pty
	return nil
}

func (c *ManagedConnection) WriteInput(data string) error {
	c.mu.RLock()
	pty := c.pty
	c.mu.RUnlock()
	if pty == nil {
		return errors.New("shell not started")
	}
	_, err := pty.Write([]byte(data))
	return err
}

func (c *ManagedConnection) ResizePTY(cols, rows int) error {
	c.mu.RLock()
	pty := c.pty
	c.mu.RUnlock()
	if pty == nil {
		return nil
	}
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
		for i := len(c.jumps) - 1; i >= 0; i-- {
			_ = c.jumps[i].Close()
		}
		c.jumps = nil
		return err
	}
	return nil
}
