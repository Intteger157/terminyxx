package connection

import (
	"bufio"
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Proxy types.
const (
	ProxyNone    = ""
	ProxySOCKS5  = "socks5"
	ProxyHTTP    = "http"
	ProxyCommand = "command"
)

// ProxySpec is how a host is reached when it is dialed directly (not
// through a jump host). App.SSHConnect fills it from the saved host only.
type ProxySpec struct {
	Type     string `json:"type"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	Password string `json:"password"`
	// Command is a ProxyCommand: %h, %p, %r and %% are replaced and it runs
	// through the shell; its stdin/stdout carry the SSH connection.
	Command string `json:"command"`
}

// dialDirect opens the TCP connection to host:port, through p if set.
func dialDirect(host string, port int, user string, p ProxySpec) (net.Conn, error) {
	addr := net.JoinHostPort(host, strconv.Itoa(port))
	switch p.Type {
	case ProxyNone:
		return net.DialTimeout("tcp", addr, dialTimeout)
	case ProxySOCKS5, ProxyHTTP:
		if p.Host == "" || p.Port <= 0 || p.Port > 65535 {
			return nil, errors.New("the proxy needs a host and a port")
		}
		paddr := net.JoinHostPort(p.Host, strconv.Itoa(p.Port))
		conn, err := net.DialTimeout("tcp", paddr, dialTimeout)
		if err != nil {
			return nil, fmt.Errorf("proxy %s: %w", paddr, err)
		}
		_ = conn.SetDeadline(time.Now().Add(dialTimeout))
		if p.Type == ProxySOCKS5 {
			err = socks5Connect(conn, host, port, p.Username, p.Password)
		} else {
			err = httpConnect(conn, addr, p.Username, p.Password)
		}
		if err != nil {
			conn.Close()
			return nil, fmt.Errorf("proxy %s: %w", paddr, err)
		}
		_ = conn.SetDeadline(time.Time{})
		return conn, nil
	case ProxyCommand:
		conn, err := dialCommand(expandProxyCommand(p.Command, host, port, user))
		if err != nil {
			return nil, err
		}
		// known_hosts checks need a host:port remote address.
		ip := net.ParseIP(host)
		if ip == nil {
			ip = net.IPv4zero
		}
		conn.(*cmdConn).remote = &net.TCPAddr{IP: ip, Port: port}
		return conn, nil
	default:
		return nil, fmt.Errorf("unknown proxy type %q", p.Type)
	}
}

// socks5Connect runs a SOCKS5 CONNECT (RFC 1928) with optional
// username/password auth (RFC 1929). The host name is sent as is, so the
// proxy resolves it.
func socks5Connect(conn net.Conn, host string, port int, user, pass string) error {
	methods := []byte{0x00}
	if user != "" {
		methods = []byte{0x02, 0x00}
	}
	if _, err := conn.Write(append([]byte{5, byte(len(methods))}, methods...)); err != nil {
		return err
	}
	var rep [2]byte
	if _, err := io.ReadFull(conn, rep[:]); err != nil {
		return err
	}
	if rep[0] != 5 {
		return errors.New("not a SOCKS5 proxy")
	}
	switch rep[1] {
	case 0x00:
	case 0x02:
		if len(user) > 255 || len(pass) > 255 {
			return errors.New("proxy user name or password too long")
		}
		msg := []byte{1, byte(len(user))}
		msg = append(msg, user...)
		msg = append(msg, byte(len(pass)))
		msg = append(msg, pass...)
		if _, err := conn.Write(msg); err != nil {
			return err
		}
		if _, err := io.ReadFull(conn, rep[:]); err != nil {
			return err
		}
		if rep[1] != 0 {
			return errors.New("the proxy rejected the user name or password")
		}
	case 0xff:
		return errors.New("the proxy accepts none of the offered login methods")
	default:
		return fmt.Errorf("the proxy chose an unsupported login method %d", rep[1])
	}

	req := []byte{5, 1, 0}
	if ip := net.ParseIP(host); ip != nil {
		if ip4 := ip.To4(); ip4 != nil {
			req = append(append(req, 1), ip4...)
		} else {
			req = append(append(req, 4), ip.To16()...)
		}
	} else {
		if len(host) > 255 {
			return errors.New("host name too long")
		}
		req = append(append(req, 3, byte(len(host))), host...)
	}
	req = append(req, byte(port>>8), byte(port))
	if _, err := conn.Write(req); err != nil {
		return err
	}
	var head [4]byte
	if _, err := io.ReadFull(conn, head[:]); err != nil {
		return err
	}
	if head[1] != 0 {
		return fmt.Errorf("SOCKS5 connect failed: %s", socksError(head[1]))
	}
	var skip int
	switch head[3] {
	case 1:
		skip = 4
	case 4:
		skip = 16
	case 3:
		var l [1]byte
		if _, err := io.ReadFull(conn, l[:]); err != nil {
			return err
		}
		skip = int(l[0])
	default:
		return errors.New("bad SOCKS5 reply")
	}
	_, err := io.ReadFull(conn, make([]byte, skip+2))
	return err
}

func socksError(code byte) string {
	switch code {
	case 1:
		return "general failure"
	case 2:
		return "not allowed by the proxy's rules"
	case 3:
		return "network unreachable"
	case 4:
		return "host unreachable"
	case 5:
		return "connection refused"
	case 6:
		return "TTL expired"
	case 7:
		return "command not supported"
	case 8:
		return "address type not supported"
	}
	return fmt.Sprintf("error %d", code)
}

// httpConnect opens a tunnel through an HTTP proxy with CONNECT.
func httpConnect(conn net.Conn, addr, user, pass string) error {
	var b strings.Builder
	fmt.Fprintf(&b, "CONNECT %s HTTP/1.1\r\nHost: %s\r\n", addr, addr)
	if user != "" {
		fmt.Fprintf(&b, "Proxy-Authorization: Basic %s\r\n", base64.StdEncoding.EncodeToString([]byte(user+":"+pass)))
	}
	b.WriteString("\r\n")
	if _, err := io.WriteString(conn, b.String()); err != nil {
		return err
	}
	// Read the reply byte by byte so nothing after the header (the server's
	// SSH banner) is swallowed by a buffer.
	br := bufio.NewReaderSize(&byteReader{conn}, 16)
	resp, err := http.ReadResponse(br, &http.Request{Method: http.MethodConnect})
	if err != nil {
		return err
	}
	if resp.StatusCode == http.StatusProxyAuthRequired {
		return errors.New("the proxy wants a (different) user name and password")
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("the proxy answered %s", resp.Status)
	}
	return nil
}

// byteReader reads one byte at a time.
type byteReader struct{ r io.Reader }

func (b *byteReader) Read(p []byte) (int, error) {
	if len(p) == 0 {
		return 0, nil
	}
	return b.r.Read(p[:1])
}

// expandProxyCommand replaces %h, %p, %r and %% like OpenSSH.
func expandProxyCommand(cmd, host string, port int, user string) string {
	var b strings.Builder
	for i := 0; i < len(cmd); i++ {
		if cmd[i] != '%' || i+1 == len(cmd) {
			b.WriteByte(cmd[i])
			continue
		}
		i++
		switch cmd[i] {
		case 'h':
			b.WriteString(host)
		case 'p':
			b.WriteString(strconv.Itoa(port))
		case 'r':
			b.WriteString(user)
		case '%':
			b.WriteByte('%')
		default:
			b.WriteByte('%')
			b.WriteByte(cmd[i])
		}
	}
	return b.String()
}

// shellCommand runs a command line through the OS shell; replaced in tests.
var shellCommand = func(line string) *exec.Cmd {
	if runtime.GOOS == "windows" {
		cmd := exec.Command("cmd.exe")
		setRawCmdLine(cmd, `/d /s /c "`+line+`"`)
		return cmd
	}
	return exec.Command("/bin/sh", "-c", line)
}

// cmdConn is a net.Conn over a ProxyCommand's stdin and stdout.
type cmdConn struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout io.ReadCloser
	stderr *tailBuffer
	once   sync.Once
	remote net.Addr
}

func dialCommand(line string) (net.Conn, error) {
	if strings.TrimSpace(line) == "" {
		return nil, errors.New("the ProxyCommand is empty")
	}
	cmd := shellCommand(line)
	hideWindow(cmd)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	tail := &tailBuffer{max: 2048}
	cmd.Stderr = tail
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("ProxyCommand: %w", err)
	}
	c := &cmdConn{cmd: cmd, stdin: stdin, stdout: stdout, stderr: tail}
	go func() { _ = cmd.Wait() }()
	return c, nil
}

func (c *cmdConn) Read(p []byte) (int, error) {
	n, err := c.stdout.Read(p)
	if err == io.EOF && n == 0 {
		if msg := c.stderr.String(); msg != "" {
			return 0, fmt.Errorf("ProxyCommand ended: %s", msg)
		}
	}
	return n, err
}
func (c *cmdConn) Write(p []byte) (int, error) { return c.stdin.Write(p) }
func (c *cmdConn) Close() error {
	c.once.Do(func() {
		_ = c.stdin.Close()
		if c.cmd.Process != nil {
			_ = c.cmd.Process.Kill()
		}
	})
	return nil
}
func (c *cmdConn) LocalAddr() net.Addr { return pipeAddr{} }
func (c *cmdConn) RemoteAddr() net.Addr {
	if c.remote != nil {
		return c.remote
	}
	return pipeAddr{}
}
func (c *cmdConn) SetDeadline(time.Time) error      { return nil }
func (c *cmdConn) SetReadDeadline(time.Time) error  { return nil }
func (c *cmdConn) SetWriteDeadline(time.Time) error { return nil }

type pipeAddr struct{}

func (pipeAddr) Network() string { return "proxycommand" }
func (pipeAddr) String() string  { return "proxycommand" }

// tailBuffer keeps the last max bytes written to it.
type tailBuffer struct {
	mu  sync.Mutex
	buf []byte
	max int
}

func (t *tailBuffer) Write(p []byte) (int, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.buf = append(t.buf, p...)
	if len(t.buf) > t.max {
		t.buf = t.buf[len(t.buf)-t.max:]
	}
	return len(p), nil
}

func (t *tailBuffer) String() string {
	t.mu.Lock()
	defer t.mu.Unlock()
	return string(bytes.TrimSpace(t.buf))
}
