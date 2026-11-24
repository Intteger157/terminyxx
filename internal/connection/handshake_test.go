package connection

import (
	"errors"
	"net"
	"testing"
	"time"
)

// A server that accepts TCP but never speaks SSH must not hang Connect.
func TestDialTimesOutOnSilentServer(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			defer c.Close() // hold it open, say nothing
		}
	}()

	old := handshakeTimeout
	handshakeTimeout = 300 * time.Millisecond
	defer func() { handshakeTimeout = old }()

	addr := ln.Addr().(*net.TCPAddr)
	done := make(chan error, 1)
	go func() {
		var report SSHDiagnostic
		_, _, err := dialSSH(ConnectRequest{Host: "127.0.0.1", Port: addr.Port, Username: "u", AuthType: "password", Password: "p"}, nil, Policy{}, &report)
		done <- err
	}()
	select {
	case err := <-done:
		if !errors.Is(err, errHandshakeTimeout) {
			t.Fatalf("got %v, want errHandshakeTimeout", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("dial hung on a silent server")
	}
}
