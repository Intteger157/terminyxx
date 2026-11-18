package connection

import (
	"bytes"
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
)

const x11AuthProto = "MIT-MAGIC-COOKIE-1"

// x11Forwarder relays X11 connections the server opens back to the local
// X server (VcXsrv / Xming on Windows, XQuartz on macOS).
//
// Like OpenSSH it gives the server a random fake cookie and swaps it for the
// local X server's real one (from xauth) in each connection's setup packet,
// so the real cookie never leaves this machine and a connection without the
// fake cookie is refused.
type x11Forwarder struct {
	display    x11Display
	fakeCookie []byte
	realCookie []byte // nil: the X server uses no authentication
}

type x11Display struct {
	network, address string
	screen           int
	name             string // as written, for xauth
}

// parseX11Display understands ":0", ":0.0", "localhost:1", "host:0.1",
// "unix:0" and XQuartz's socket paths ("/private/tmp/…/org.xquartz:0").
func parseX11Display(d string) (x11Display, error) {
	d = strings.TrimSpace(d)
	if d == "" {
		return x11Display{}, errors.New("no X display configured")
	}
	if strings.HasPrefix(d, "/") {
		return x11Display{network: "unix", address: d, name: d}, nil
	}
	i := strings.LastIndex(d, ":")
	if i < 0 {
		return x11Display{}, fmt.Errorf("invalid X display %q", d)
	}
	host, rest := d[:i], d[i+1:]
	numStr, screenStr, _ := strings.Cut(rest, ".")
	num, err := strconv.Atoi(numStr)
	if err != nil || num < 0 || num > 1000 {
		return x11Display{}, fmt.Errorf("invalid X display %q", d)
	}
	screen := 0
	if screenStr != "" {
		if screen, err = strconv.Atoi(screenStr); err != nil || screen < 0 {
			return x11Display{}, fmt.Errorf("invalid X display %q", d)
		}
	}
	out := x11Display{screen: screen, name: d}
	if (host == "" || host == "unix") && runtime.GOOS != "windows" {
		out.network, out.address = "unix", fmt.Sprintf("/tmp/.X11-unix/X%d", num)
		return out, nil
	}
	if host == "" || host == "unix" {
		host = "127.0.0.1"
	}
	host = strings.Trim(host, "[]")
	out.network, out.address = "tcp", net.JoinHostPort(host, strconv.Itoa(6000+num))
	return out, nil
}

// DefaultX11Display is used when the setting is empty: $DISPLAY, XQuartz's
// launchd socket on macOS, else the first display on localhost.
func DefaultX11Display() string {
	if d := os.Getenv("DISPLAY"); d != "" {
		return d
	}
	if runtime.GOOS == "darwin" {
		if m, _ := filepath.Glob("/private/tmp/com.apple.launchd.*/org.xquartz:0"); len(m) > 0 {
			return m[0]
		}
	}
	return "localhost:0.0"
}

// startX11 prepares forwarding for client. The channel handler is installed
// once per client; request() then asks the server for it per session.
func startX11(client *ssh.Client, display string) (*x11Forwarder, error) {
	if display == "" {
		display = DefaultX11Display()
	}
	disp, err := parseX11Display(display)
	if err != nil {
		return nil, err
	}
	f := &x11Forwarder{display: disp, fakeCookie: make([]byte, 16)}
	if _, err := rand.Read(f.fakeCookie); err != nil {
		return nil, err
	}
	f.realCookie = xauthCookie(disp.name)
	chans := client.HandleChannelOpen("x11")
	if chans == nil {
		return nil, errors.New("X11 forwarding is already set up on this connection")
	}
	go func() {
		for nc := range chans {
			go f.serve(nc)
		}
	}()
	return f, nil
}

// request asks the server to forward X11 for one session (before Shell).
func (f *x11Forwarder) request(s *ssh.Session) error {
	payload := ssh.Marshal(struct {
		SingleConnection bool
		AuthProtocol     string
		AuthCookie       string
		ScreenNumber     uint32
	}{false, x11AuthProto, hex.EncodeToString(f.fakeCookie), uint32(f.display.screen)})
	ok, err := s.SendRequest("x11-req", true, payload)
	if err == nil && !ok {
		err = errors.New("the server refused X11 forwarding (X11Forwarding no in sshd_config?)")
	}
	return err
}

func (f *x11Forwarder) serve(nc ssh.NewChannel) {
	local, err := net.DialTimeout(f.display.network, f.display.address, 5*time.Second)
	if err != nil {
		_ = nc.Reject(ssh.ConnectionFailed, "no local X server: "+err.Error())
		return
	}
	ch, reqs, err := nc.Accept()
	if err != nil {
		local.Close()
		return
	}
	go ssh.DiscardRequests(reqs)
	defer ch.Close()
	defer local.Close()

	setup, err := f.rewriteSetup(ch)
	if err != nil {
		return
	}
	if _, err := local.Write(setup); err != nil {
		return
	}
	done := make(chan struct{}, 2)
	go func() { _, _ = io.Copy(local, ch); done <- struct{}{} }()
	go func() { _, _ = io.Copy(ch, local); _ = ch.CloseWrite(); done <- struct{}{} }()
	<-done
}

// rewriteSetup reads the client's connection setup packet, checks that it
// carries the fake cookie and returns it with the real one (or none).
func (f *x11Forwarder) rewriteSetup(r io.Reader) ([]byte, error) {
	var head [12]byte
	if _, err := io.ReadFull(r, head[:]); err != nil {
		return nil, err
	}
	var order binary.ByteOrder
	switch head[0] {
	case 'B':
		order = binary.BigEndian
	case 'l':
		order = binary.LittleEndian
	default:
		return nil, errors.New("x11: bad byte order")
	}
	nameLen := int(order.Uint16(head[6:]))
	dataLen := int(order.Uint16(head[8:]))
	body := make([]byte, pad4(nameLen)+pad4(dataLen))
	if _, err := io.ReadFull(r, body); err != nil {
		return nil, err
	}
	name := string(body[:nameLen])
	data := body[pad4(nameLen) : pad4(nameLen)+dataLen]
	if name != x11AuthProto || !bytes.Equal(data, f.fakeCookie) {
		return nil, errors.New("x11: connection without the session's cookie")
	}
	var out bytes.Buffer
	out.Write(head[:6])
	if f.realCookie == nil {
		out.Write([]byte{0, 0, 0, 0, 0, 0})
		return out.Bytes(), nil
	}
	var lens [6]byte
	order.PutUint16(lens[0:], uint16(len(x11AuthProto)))
	order.PutUint16(lens[2:], uint16(len(f.realCookie)))
	out.Write(lens[:])
	out.WriteString(x11AuthProto)
	out.Write(make([]byte, pad4(len(x11AuthProto))-len(x11AuthProto)))
	out.Write(f.realCookie)
	out.Write(make([]byte, pad4(len(f.realCookie))-len(f.realCookie)))
	return out.Bytes(), nil
}

func pad4(n int) int { return (n + 3) &^ 3 }

// xauthCookie returns the local X server's MIT cookie for display, or nil
// when xauth is missing or has none (VcXsrv started with -ac, for example).
func xauthCookie(display string) []byte {
	bin := "xauth"
	if _, err := exec.LookPath(bin); err != nil {
		if runtime.GOOS == "darwin" {
			bin = "/opt/X11/bin/xauth"
		} else {
			return nil
		}
	}
	cmd := exec.Command(bin, "list", display)
	hideWindow(cmd)
	out, err := cmd.Output()
	if err != nil {
		return nil
	}
	return parseXauthList(string(out))
}

func parseXauthList(out string) []byte {
	for _, line := range strings.Split(out, "\n") {
		f := strings.Fields(line)
		if len(f) == 3 && f[1] == x11AuthProto {
			if b, err := hex.DecodeString(f[2]); err == nil && len(b) > 0 {
				return b
			}
		}
	}
	return nil
}
