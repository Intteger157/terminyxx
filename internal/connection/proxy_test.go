package connection

import (
	"bufio"
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"testing"
)

// relay copies between a and b until one side closes.
func relay(a, b net.Conn) {
	go func() { _, _ = io.Copy(a, b); a.Close() }()
	_, _ = io.Copy(b, a)
	b.Close()
}

// startSOCKS5 is a minimal SOCKS5 server that wants user "pu" / "pp" and
// records the requested destination.
func startSOCKS5(t *testing.T, gotDest *string) string {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func(c net.Conn) {
				buf := make([]byte, 512)
				_, _ = io.ReadFull(c, buf[:2])
				_, _ = io.ReadFull(c, buf[:buf[1]])
				_, _ = c.Write([]byte{5, 2})
				_, _ = io.ReadFull(c, buf[:2])
				user := make([]byte, buf[1])
				_, _ = io.ReadFull(c, user)
				_, _ = io.ReadFull(c, buf[:1])
				pass := make([]byte, buf[0])
				_, _ = io.ReadFull(c, pass)
				if string(user) != "pu" || string(pass) != "pp" {
					_, _ = c.Write([]byte{1, 1})
					c.Close()
					return
				}
				_, _ = c.Write([]byte{1, 0})
				_, _ = io.ReadFull(c, buf[:4])
				var host string
				switch buf[3] {
				case 1:
					_, _ = io.ReadFull(c, buf[:4])
					host = net.IP(buf[:4]).String()
				case 3:
					_, _ = io.ReadFull(c, buf[:1])
					n := int(buf[0])
					_, _ = io.ReadFull(c, buf[:n])
					host = string(buf[:n])
				}
				_, _ = io.ReadFull(c, buf[:2])
				port := int(binary.BigEndian.Uint16(buf[:2]))
				*gotDest = net.JoinHostPort(host, strconv.Itoa(port))
				if host == "localhost" {
					host = "127.0.0.1"
				}
				up, err := net.Dial("tcp", net.JoinHostPort(host, strconv.Itoa(port)))
				if err != nil {
					_, _ = c.Write([]byte{5, 5, 0, 1, 0, 0, 0, 0, 0, 0})
					c.Close()
					return
				}
				_, _ = c.Write([]byte{5, 0, 0, 1, 127, 0, 0, 1, 0, 0})
				relay(c, up)
			}(c)
		}
	}()
	return ln.Addr().String()
}

func startHTTPProxy(t *testing.T) string {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	want := "Basic " + base64.StdEncoding.EncodeToString([]byte("pu:pp"))
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func(c net.Conn) {
				req, err := http.ReadRequest(bufio.NewReader(c))
				if err != nil || req.Method != http.MethodConnect {
					c.Close()
					return
				}
				if req.Header.Get("Proxy-Authorization") != want {
					_, _ = io.WriteString(c, "HTTP/1.1 407 Proxy Authentication Required\r\n\r\n")
					c.Close()
					return
				}
				up, err := net.Dial("tcp", req.Host)
				if err != nil {
					_, _ = io.WriteString(c, "HTTP/1.1 502 Bad Gateway\r\n\r\n")
					c.Close()
					return
				}
				_, _ = io.WriteString(c, "HTTP/1.1 200 Connection established\r\n\r\n")
				relay(c, up)
			}(c)
		}
	}()
	return ln.Addr().String()
}

func proxyAt(kind, addr string) ProxySpec {
	h, p, _ := net.SplitHostPort(addr)
	port, _ := strconv.Atoi(p)
	return ProxySpec{Type: kind, Host: h, Port: port, Username: "pu", Password: "pp"}
}

func TestSOCKS5Proxy(t *testing.T) {
	srv := newTestServer(t, serverOpts{password: "secret"})
	var dest string
	proxy := proxyAt(ProxySOCKS5, startSOCKS5(t, &dest))
	m, _, _ := newManager(t)
	req := passwordReq(srv, "s")
	req.Host = "localhost"
	req.Proxy = proxy
	connectTrusted(t, m, req)
	if dest != net.JoinHostPort("localhost", strconv.Itoa(srv.port)) {
		t.Errorf("proxy got destination %q, want the host name unresolved", dest)
	}

	req.ID = "s2"
	req.Proxy.Password = "wrong"
	if err := m.Connect(req); err == nil || !strings.Contains(err.Error(), "rejected the user name") {
		t.Errorf("wrong proxy password: %v", err)
	}
}

func TestHTTPProxy(t *testing.T) {
	srv := newTestServer(t, serverOpts{password: "secret"})
	m, _, _ := newManager(t)
	req := passwordReq(srv, "h")
	req.Proxy = proxyAt(ProxyHTTP, startHTTPProxy(t))
	connectTrusted(t, m, req)

	req.ID = "h2"
	req.Proxy.Password = "wrong"
	if err := m.Connect(req); err == nil || !strings.Contains(err.Error(), "user name and password") {
		t.Errorf("wrong proxy password: %v", err)
	}
}

// TestProxyCommandHelper is not a test: it is the ProxyCommand run by
// TestProxyCommand (the test binary pipes stdin/stdout to an address).
func TestProxyCommandHelper(t *testing.T) {
	addr := os.Getenv("TERMINYXX_PROXY_TO")
	if addr == "" {
		t.Skip("helper process")
	}
	c, err := net.Dial("tcp", addr)
	if err != nil {
		os.Exit(2)
	}
	go func() { _, _ = io.Copy(c, os.Stdin); c.Close() }()
	_, _ = io.Copy(os.Stdout, c)
	os.Exit(0)
}

func TestProxyCommand(t *testing.T) {
	srv := newTestServer(t, serverOpts{password: "secret"})
	var line string
	old := shellCommand
	shellCommand = func(l string) *exec.Cmd {
		line = l
		cmd := exec.Command(os.Args[0], "-test.run=^TestProxyCommandHelper$")
		cmd.Env = append(os.Environ(), "TERMINYXX_PROXY_TO="+srv.addr)
		return cmd
	}
	defer func() { shellCommand = old }()

	m, _, _ := newManager(t)
	req := passwordReq(srv, "c")
	req.Proxy = ProxySpec{Type: ProxyCommand, Command: "nc -X connect %h %p # %r 100%%"}
	connectTrusted(t, m, req)
	want := "nc -X connect " + srv.host + " " + strconv.Itoa(srv.port) + " # u 100%"
	if line != want {
		t.Errorf("command = %q, want %q", line, want)
	}
}

func TestParseX11Display(t *testing.T) {
	for in, want := range map[string]string{
		"localhost:0.0": "tcp 127.0.0.1:6000",
		"10.0.0.2:1":    "tcp 10.0.0.2:6001",
		"/private/tmp/com.apple.launchd.x/org.xquartz:0": "unix /private/tmp/com.apple.launchd.x/org.xquartz:0",
	} {
		d, err := parseX11Display(in)
		if in == "localhost:0.0" {
			d.address = strings.Replace(d.address, "localhost", "127.0.0.1", 1)
		}
		if err != nil || d.network+" "+d.address != want {
			t.Errorf("%s -> %+v %v, want %s", in, d, err, want)
		}
	}
	if d, _ := parseX11Display(":2.1"); d.screen != 1 {
		t.Errorf(":2.1 screen = %d", d.screen)
	}
	for _, bad := range []string{"", "host", ":x", ":-1"} {
		if _, err := parseX11Display(bad); err == nil {
			t.Errorf("%q accepted", bad)
		}
	}
}

func x11Setup(order byte, name string, data []byte) []byte {
	var b bytes.Buffer
	var bo binary.ByteOrder = binary.LittleEndian
	if order == 'B' {
		bo = binary.BigEndian
	}
	b.Write([]byte{order, 0})
	h := make([]byte, 10)
	bo.PutUint16(h[0:], 11)
	bo.PutUint16(h[2:], 0)
	bo.PutUint16(h[4:], uint16(len(name)))
	bo.PutUint16(h[6:], uint16(len(data)))
	b.Write(h)
	b.WriteString(name)
	b.Write(make([]byte, pad4(len(name))-len(name)))
	b.Write(data)
	b.Write(make([]byte, pad4(len(data))-len(data)))
	return b.Bytes()
}

func TestX11CookieSwap(t *testing.T) {
	fake := bytes.Repeat([]byte{7}, 16)
	real := bytes.Repeat([]byte{9}, 16)
	f := &x11Forwarder{fakeCookie: fake, realCookie: real}
	for _, order := range []byte{'l', 'B'} {
		got, err := f.rewriteSetup(bytes.NewReader(x11Setup(order, x11AuthProto, fake)))
		if err != nil {
			t.Fatal(err)
		}
		if want := x11Setup(order, x11AuthProto, real); !bytes.Equal(got, want) {
			t.Errorf("%c: got %x\nwant %x", order, got, want)
		}
	}
	if _, err := f.rewriteSetup(bytes.NewReader(x11Setup('l', x11AuthProto, real))); err == nil {
		t.Error("a connection with another cookie was accepted")
	}
	f.realCookie = nil
	got, _ := f.rewriteSetup(bytes.NewReader(x11Setup('l', x11AuthProto, fake)))
	if want := x11Setup('l', "", nil); !bytes.Equal(got, want) {
		t.Errorf("no-auth setup = %x, want %x", got, want)
	}
	cookie := parseXauthList("host/unix:0  MIT-MAGIC-COOKIE-1  " + hex.EncodeToString(real) + "\n")
	if !bytes.Equal(cookie, real) {
		t.Errorf("xauth cookie = %x", cookie)
	}
}
