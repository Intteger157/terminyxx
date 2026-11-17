package connection

import (
	"bytes"
	"io"
	"net"
	"strings"
	"testing"
	"time"
)

func TestTelnetSession(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })

	got := make(chan []byte, 1)
	go func() {
		c, err := ln.Accept()
		if err != nil {
			return
		}
		defer c.Close()
		// Offer options, then send text containing an escaped 0xFF.
		c.Write([]byte{tIAC, tDO, optNAWS, tIAC, tWILL, optEcho, tIAC, tDO, 99, tIAC, tWILL, 98})
		c.Write([]byte("login: \xff\xff!"))
		var in bytes.Buffer
		c.SetReadDeadline(time.Now().Add(3 * time.Second))
		buf := make([]byte, 256)
		for !bytes.Contains(in.Bytes(), []byte("ls\r\x00")) {
			n, err := c.Read(buf)
			in.Write(buf[:n])
			if err != nil {
				break
			}
		}
		got <- in.Bytes()
	}()

	rec := newRecorder()
	m := NewConnectionManager(rec, nil)
	t.Cleanup(m.CloseAll)
	host, portStr, _ := net.SplitHostPort(ln.Addr().String())
	port := 0
	for _, ch := range portStr {
		port = port*10 + int(ch-'0')
	}
	if err := m.ConnectStream(StreamRequest{ID: "t1", Kind: StreamTelnet, Host: host, Port: port}); err != nil {
		t.Fatal(err)
	}
	if !rec.has("connection:state:t1", "connected") {
		t.Fatal("no connected event")
	}
	must(t, m.StartShell("t1", 100, 40))

	deadline := time.Now().Add(3 * time.Second)
	for !strings.Contains(rec.output("t1"), "login: \xff!") && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if out := rec.output("t1"); out != "login: \xff!" {
		t.Fatalf("output %q (protocol bytes must be stripped, FF FF is one data byte)", out)
	}

	must(t, m.WriteInput("t1", "ls\r"))
	var in []byte
	select {
	case in = <-got:
	case <-time.After(4 * time.Second):
		t.Fatal("server saw nothing")
	}
	for _, want := range [][]byte{
		{tIAC, tWILL, optNAWS},
		{tIAC, tSB, optNAWS, 0, 100, 0, 40, tIAC, tSE}, // size known before the offer was answered
		{tIAC, tDO, optEcho},
		{tIAC, tWONT, 99}, // unknown options are refused
		{tIAC, tDONT, 98},
		[]byte("ls\r\x00"), // CR is sent as CR NUL
	} {
		if !bytes.Contains(in, want) {
			t.Errorf("server did not receive % x\nreceived: % x", want, in)
		}
	}

	// Disconnecting ends the stream and reports it.
	must(t, m.Disconnect("t1"))
	if !rec.has("connection:state:t1", "disconnected") {
		t.Error("no disconnected event")
	}
}

func TestTelnetEscapesInput(t *testing.T) {
	c1, c2 := net.Pipe()
	defer c1.Close()
	defer c2.Close()
	tn := newTelnetConn(c1)
	go tn.Write([]byte("a\xffb\r\nc"))
	buf := make([]byte, 64)
	c2.SetReadDeadline(time.Now().Add(2 * time.Second))
	var out []byte
	for len(out) < 7 {
		n, err := c2.Read(buf)
		out = append(out, buf[:n]...)
		if err != nil {
			break
		}
	}
	if !bytes.Equal(out, []byte{'a', 0xff, 0xff, 'b', '\r', '\n', 'c'}) {
		t.Fatalf("% x", out)
	}
}

func TestSerialModeValidation(t *testing.T) {
	if _, err := serialMode(StreamRequest{Baud: 115200, DataBits: 8, Parity: "even", StopBits: "2"}); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []StreamRequest{{Baud: 5}, {DataBits: 9}, {Parity: "x"}, {StopBits: "3"}} {
		if _, err := serialMode(bad); err == nil {
			t.Errorf("accepted %+v", bad)
		}
	}
	m, _, _ := newManager(t)
	if err := m.ConnectStream(StreamRequest{ID: "s", Kind: StreamSerial}); err == nil {
		t.Error("serial without a device accepted")
	}
	if err := m.ConnectStream(StreamRequest{ID: "s", Kind: "bogus"}); err == nil {
		t.Error("unknown kind accepted")
	}
	_ = io.EOF
}
