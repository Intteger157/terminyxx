package connection

import (
	"crypto/ed25519"
	"crypto/rand"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

const testBanner = "Добро пожаловать на тестовый сервер\r\n$ "

type testServer struct {
	addr     string
	host     string
	port     int
	hostKey  ssh.Signer
	listener net.Listener
}

type serverOpts struct {
	password      string
	keyboardOnly  bool
	authorizedKey ssh.PublicKey
}

func newTestServer(t *testing.T, opts serverOpts) *testServer {
	t.Helper()
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := ssh.NewSignerFromKey(priv)
	if err != nil {
		t.Fatal(err)
	}

	cfg := &ssh.ServerConfig{}
	if opts.keyboardOnly {
		cfg.KeyboardInteractiveCallback = func(_ ssh.ConnMetadata, ch ssh.KeyboardInteractiveChallenge) (*ssh.Permissions, error) {
			ans, err := ch("", "", []string{"Password: "}, []bool{false})
			if err != nil {
				return nil, err
			}
			if len(ans) == 1 && ans[0] == opts.password {
				return nil, nil
			}
			return nil, fmt.Errorf("bad password")
		}
	} else if opts.password != "" {
		cfg.PasswordCallback = func(_ ssh.ConnMetadata, pw []byte) (*ssh.Permissions, error) {
			if string(pw) == opts.password {
				return nil, nil
			}
			return nil, fmt.Errorf("bad password")
		}
	}
	if opts.authorizedKey != nil {
		want := opts.authorizedKey.Marshal()
		cfg.PublicKeyCallback = func(_ ssh.ConnMetadata, key ssh.PublicKey) (*ssh.Permissions, error) {
			if string(key.Marshal()) == string(want) {
				return nil, nil
			}
			return nil, fmt.Errorf("unknown key")
		}
	}
	cfg.AddHostKey(signer)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })

	fs := sftp.InMemHandler()
	go func() {
		for {
			nc, err := ln.Accept()
			if err != nil {
				return
			}
			go serveConn(nc, cfg, fs)
		}
	}()

	host, portStr, _ := net.SplitHostPort(ln.Addr().String())
	port, _ := strconv.Atoi(portStr)
	return &testServer{addr: ln.Addr().String(), host: host, port: port, hostKey: signer, listener: ln}
}

func serveConn(nc net.Conn, cfg *ssh.ServerConfig, fs sftp.Handlers) {
	sconn, chans, reqs, err := ssh.NewServerConn(nc, cfg)
	if err != nil {
		nc.Close()
		return
	}
	sc := &serverConnForwards{conn: sconn}
	go func() {
		for req := range reqs {
			sc.handleGlobal(req)
		}
	}()
	for nch := range chans {
		if nch.ChannelType() == "direct-tcpip" {
			go handleDirectTCPIP(nch)
			continue
		}
		if nch.ChannelType() != "session" {
			nch.Reject(ssh.UnknownChannelType, "")
			continue
		}
		ch, chReqs, err := nch.Accept()
		if err != nil {
			continue
		}
		go handleSession(ch, chReqs, fs)
	}
}

func handleSession(ch ssh.Channel, reqs <-chan *ssh.Request, fs sftp.Handlers) {
	for req := range reqs {
		switch req.Type {
		case "pty-req", "env", "window-change":
			req.Reply(true, nil)
		case "shell":
			req.Reply(true, nil)
			go fakeShell(ch)
		case "subsystem":
			if len(req.Payload) > 4 && string(req.Payload[4:]) == "sftp" {
				req.Reply(true, nil)
				go func() {
					srv := sftp.NewRequestServer(ch, fs)
					_ = srv.Serve()
					srv.Close()
					ch.Close()
				}()
			} else {
				req.Reply(false, nil)
			}
		default:
			req.Reply(false, nil)
		}
	}
}

// fakeShell writes a Cyrillic banner byte-by-byte (to exercise UTF-8
// reassembly), then echoes lines until it reads "exit".
func fakeShell(ch ssh.Channel) {
	for _, b := range []byte(testBanner) {
		ch.Write([]byte{b})
	}
	var line strings.Builder
	buf := make([]byte, 256)
	for {
		n, err := ch.Read(buf)
		if err != nil {
			return
		}
		for _, b := range buf[:n] {
			if b == '\r' || b == '\n' {
				cmd := line.String()
				line.Reset()
				if cmd == "exit" {
					ch.SendRequest("exit-status", false, ssh.Marshal(struct{ Status uint32 }{0}))
					ch.Close()
					return
				}
				fmt.Fprintf(ch, "\r\nout:%s\r\n$ ", cmd)
				continue
			}
			line.WriteByte(b)
		}
	}
}

// recorder collects emitted events for assertions.
type recorder struct {
	mu     sync.Mutex
	events []recorded
	notify chan struct{}
}

type recorded struct {
	name string
	data []interface{}
}

func newRecorder() *recorder { return &recorder{notify: make(chan struct{}, 1024)} }

func (r *recorder) Emit(name string, data ...interface{}) {
	r.mu.Lock()
	r.events = append(r.events, recorded{name, data})
	r.mu.Unlock()
	select {
	case r.notify <- struct{}{}:
	default:
	}
}

func (r *recorder) output(id string) string {
	r.mu.Lock()
	defer r.mu.Unlock()
	var sb strings.Builder
	for _, e := range r.events {
		if e.name == "terminal:output:"+id {
			sb.WriteString(e.data[0].(string))
		}
	}
	return sb.String()
}

func (r *recorder) has(name string, value interface{}) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, e := range r.events {
		if e.name == name && (value == nil || (len(e.data) > 0 && e.data[0] == value)) {
			return true
		}
	}
	return false
}

func (r *recorder) waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.After(5 * time.Second)
	for !cond() {
		select {
		case <-r.notify:
		case <-time.After(20 * time.Millisecond):
		case <-deadline:
			t.Fatalf("timed out waiting for %s", what)
		}
	}
}

var _ io.Reader // keep io imported for helpers in other test files

func (r *recorder) reset() {
	r.mu.Lock()
	r.events = nil
	r.mu.Unlock()
}

// handleDirectTCPIP serves `ssh -L` / SOCKS channels by dialing the target.
func handleDirectTCPIP(nch ssh.NewChannel) {
	var p struct {
		Host     string
		Port     uint32
		OrigHost string
		OrigPort uint32
	}
	if err := ssh.Unmarshal(nch.ExtraData(), &p); err != nil {
		nch.Reject(ssh.ConnectionFailed, "bad payload")
		return
	}
	dst, err := net.Dial("tcp", net.JoinHostPort(p.Host, strconv.Itoa(int(p.Port))))
	if err != nil {
		nch.Reject(ssh.ConnectionFailed, err.Error())
		return
	}
	ch, reqs, err := nch.Accept()
	if err != nil {
		dst.Close()
		return
	}
	go ssh.DiscardRequests(reqs)
	go func() { io.Copy(dst, ch); dst.Close() }()
	go func() { io.Copy(ch, dst); ch.Close() }()
}

// serverConnForwards implements `tcpip-forward` for one server connection.
type serverConnForwards struct {
	conn      *ssh.ServerConn
	mu        sync.Mutex
	listeners []net.Listener
}

func (s *serverConnForwards) handleGlobal(req *ssh.Request) {
	if req.Type != "tcpip-forward" {
		req.Reply(false, nil)
		return
	}
	var p struct {
		Host string
		Port uint32
	}
	if ssh.Unmarshal(req.Payload, &p) != nil {
		req.Reply(false, nil)
		return
	}
	ln, err := net.Listen("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(int(p.Port))))
	if err != nil {
		req.Reply(false, nil)
		return
	}
	s.mu.Lock()
	s.listeners = append(s.listeners, ln)
	s.mu.Unlock()
	_, portStr, _ := net.SplitHostPort(ln.Addr().String())
	bound, _ := strconv.Atoi(portStr)
	req.Reply(true, ssh.Marshal(struct{ Port uint32 }{uint32(bound)}))
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go s.forward(c, p.Host, uint32(bound))
		}
	}()
}

func (s *serverConnForwards) forward(c net.Conn, host string, port uint32) {
	payload := ssh.Marshal(struct {
		Host     string
		Port     uint32
		OrigHost string
		OrigPort uint32
	}{host, port, "127.0.0.1", 1})
	ch, reqs, err := s.conn.OpenChannel("forwarded-tcpip", payload)
	if err != nil {
		c.Close()
		return
	}
	go ssh.DiscardRequests(reqs)
	go func() { io.Copy(ch, c); ch.Close() }()
	go func() { io.Copy(c, ch); c.Close() }()
}
