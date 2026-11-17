package rdpgw

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/asn1"
	"errors"
	"io"
	"math/big"
	"net"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// Vectors from IronRDP's crates/ironrdp-testsuite-core/tests/rdcleanpath.rs.
var (
	requestDER = []byte{
		0x30, 0x32, 0xA0, 0x4, 0x2, 0x2, 0xD, 0x3E, 0xA2, 0xD, 0xC, 0xB, 0x64, 0x65, 0x73, 0x74, 0x69, 0x6E, 0x61, 0x74,
		0x69, 0x6F, 0x6E, 0xA3, 0xC, 0xC, 0xA, 0x70, 0x72, 0x6F, 0x78, 0x79, 0x20, 0x61, 0x75, 0x74, 0x68, 0xA5, 0x5, 0xC,
		0x3, 0x50, 0x43, 0x42, 0xA6, 0x6, 0x4, 0x4, 0xDE, 0xAD, 0xBE, 0xFF,
	}
	responseDER = []byte{
		0x30, 0x34, 0xA0, 0x4, 0x2, 0x2, 0xD, 0x3E, 0xA6, 0x6, 0x4, 0x4, 0xDE, 0xAD, 0xBE, 0xFF, 0xA7, 0x14, 0x30, 0x12,
		0x4, 0x4, 0xDE, 0xAD, 0xBE, 0xFF, 0x4, 0x4, 0xDE, 0xAD, 0xBE, 0xFF, 0x4, 0x4, 0xDE, 0xAD, 0xBE, 0xFF, 0xA9, 0xE,
		0xC, 0xC, 0x31, 0x39, 0x32, 0x2E, 0x31, 0x36, 0x38, 0x2E, 0x37, 0x2E, 0x39, 0x35,
	}
	httpErrorDER = []byte{
		0x30, 0x15, 0xA0, 0x4, 0x2, 0x2, 0xD, 0x3E, 0xA1, 0xD, 0x30, 0xB, 0xA0, 0x3, 0x2, 0x1, 0x1, 0xA1, 0x4, 0x2, 0x2,
		0x1, 0xF4,
	}
)

func TestPDUVectors(t *testing.T) {
	p, err := decodePDU(requestDER)
	if err != nil {
		t.Fatal(err)
	}
	if p.Destination != "destination" || p.ProxyAuth != "proxy auth" || p.PreconnectionBlob != "PCB" ||
		!bytes.Equal(p.X224, []byte{0xDE, 0xAD, 0xBE, 0xFF}) {
		t.Fatalf("decoded request: %+v", p)
	}
	if n, _ := derLength(requestDER); n != len(requestDER) {
		t.Fatalf("derLength = %d, want %d", n, len(requestDER))
	}
	x := []byte{0xDE, 0xAD, 0xBE, 0xFF}
	got, err := encodeResponse("192.168.7.95", x, [][]byte{x, x, x})
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, responseDER) {
		t.Fatalf("response:\n got %x\nwant %x", got, responseDER)
	}
	if got := encodeError(pduError{Code: errGeneral, HTTPStatus: 500}); !bytes.Equal(got, httpErrorDER) {
		t.Fatalf("error:\n got %x\nwant %x", got, httpErrorDER)
	}
}

func TestConnectionConfirm(t *testing.T) {
	ok := []byte{0x03, 0, 0, 19, 14, 0xD0, 0, 0, 0x12, 0x34, 0, 0x02, 0x1F, 0x08, 0, 0x02, 0, 0, 0}
	n, err := parseConnectionConfirm(ok)
	if err != nil || n.failed || n.selected != protocolHybrid {
		t.Fatalf("got %+v, %v", n, err)
	}
	fail := []byte{0x03, 0, 0, 19, 14, 0xD0, 0, 0, 0x12, 0x34, 0, 0x03, 0, 0x08, 0, 0x05, 0, 0, 0}
	n, err = parseConnectionConfirm(fail)
	if err != nil || !n.failed || n.code != 5 {
		t.Fatalf("got %+v, %v", n, err)
	}
	if !validConnectionRequest(probeConnectionRequest()) {
		t.Fatal("probe request should be a valid connection request")
	}
}

// fakeServer answers the X.224 request selecting CredSSP, upgrades to TLS
// with a self-signed certificate and echoes everything after that.
func fakeServer(t *testing.T) (host string, port int) {
	t.Helper()
	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "rdp-test"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	cfg := &tls.Config{Certificates: []tls.Certificate{{Certificate: [][]byte{der}, PrivateKey: key}}}
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
				defer c.Close()
				if _, err := readTPKT(c); err != nil {
					return
				}
				cc := []byte{0x03, 0, 0, 19, 14, 0xD0, 0, 0, 0x12, 0x34, 0, 0x02, 0, 0x08, 0, 0x02, 0, 0, 0}
				if _, err := c.Write(cc); err != nil {
					return
				}
				tc := tls.Server(c, cfg)
				_, _ = io.Copy(tc, tc)
			}(c)
		}
	}()
	a := ln.Addr().(*net.TCPAddr)
	return "127.0.0.1", a.Port
}

func TestGatewaySession(t *testing.T) {
	host, port := fakeServer(t)
	dest := net.JoinHostPort(host, strconv.Itoa(port))
	trust := NewTrustStore(filepath.Join(t.TempDir(), "rdp_known_certs"))

	chain, err := Probe(context.Background(), host, port)
	if err != nil {
		t.Fatal(err)
	}
	var ue *UntrustedError
	if err := trust.Check(dest, host, chain); !errors.As(err, &ue) || ue.Changed {
		t.Fatalf("expected an unknown-certificate error, got %v", err)
	}

	g := New(trust)
	defer g.Shutdown()

	// Untrusted: the gateway refuses after the TLS handshake.
	url, token, err := g.Issue("tab1", host, port)
	if err != nil {
		t.Fatal(err)
	}
	if resp := roundTrip(t, url, token); resp.Error.Code != errUntrusted {
		t.Fatalf("expected errUntrusted, got %+v", resp.Error)
	}
	if g.LastError("tab1") == "" {
		t.Fatal("LastError should explain the failure")
	}

	if err := trust.Trust(dest, ue.Fingerprint); err != nil {
		t.Fatal(err)
	}
	url, token, err = g.Issue("tab1", host, port)
	if err != nil {
		t.Fatal(err)
	}
	ws := dialWS(t, url)
	defer ws.Close()
	sendRequest(t, ws, token)
	resp := readPDU(t, ws)
	if resp.Error.Code != 0 || len(resp.ServerCertChain) != 1 || len(resp.X224) != 19 {
		t.Fatalf("unexpected response %+v", resp)
	}
	// After the handshake the socket relays the stream (the fake echoes).
	if err := ws.WriteMessage(websocket.BinaryMessage, []byte("hello")); err != nil {
		t.Fatal(err)
	}
	_, data, err := ws.ReadMessage()
	if err != nil || string(data) != "hello" {
		t.Fatalf("echo: %q, %v", data, err)
	}

	// A ticket is single-use.
	if resp := roundTrip(t, url, token); resp.Error.HTTPStatus != 401 {
		t.Fatalf("reused ticket: %+v", resp.Error)
	}

	g.Close("tab1")
	_ = ws.SetReadDeadline(time.Now().Add(5 * time.Second))
	if _, _, err := ws.ReadMessage(); err == nil {
		t.Fatal("Close should end the session")
	}
}

func dialWS(t *testing.T, url string) *websocket.Conn {
	t.Helper()
	ws, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatal(err)
	}
	return ws
}

func sendRequest(t *testing.T, ws *websocket.Conn, token string) {
	t.Helper()
	req, err := asn1.Marshal(pdu{Version: rdcleanpathVersion, Destination: "x", ProxyAuth: token, X224: probeConnectionRequest()})
	if err != nil {
		t.Fatal(err)
	}
	// Split across two messages: the gateway must reassemble.
	if err := ws.WriteMessage(websocket.BinaryMessage, req[:3]); err != nil {
		t.Fatal(err)
	}
	if err := ws.WriteMessage(websocket.BinaryMessage, req[3:]); err != nil {
		t.Fatal(err)
	}
}

func readPDU(t *testing.T, ws *websocket.Conn) *pdu {
	t.Helper()
	_ = ws.SetReadDeadline(time.Now().Add(10 * time.Second))
	_, data, err := ws.ReadMessage()
	if err != nil {
		t.Fatal(err)
	}
	p, err := decodePDU(data)
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func roundTrip(t *testing.T, url, token string) *pdu {
	t.Helper()
	ws := dialWS(t, url)
	defer ws.Close()
	sendRequest(t, ws, token)
	return readPDU(t, ws)
}

func TestChannelTicketsAreSingleUse(t *testing.T) {
	g := New(nil)
	defer g.Shutdown()
	got := make(chan string, 1)
	g.SetChannelHandler("drive", func(tabID string, ws *websocket.Conn) { got <- tabID })
	url, err := g.IssueChannel("tab1", "drive")
	if err != nil {
		t.Fatal(err)
	}
	ws, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatal(err)
	}
	ws.Close()
	if tab := <-got; tab != "tab1" {
		t.Fatalf("tab = %q", tab)
	}
	if _, resp, err := websocket.DefaultDialer.Dial(url, nil); err == nil || resp == nil || resp.StatusCode != 401 {
		t.Fatalf("second use: %v %v", err, resp)
	}
	bad := url[:strings.LastIndex(url, "=")+1] + "00"
	if _, _, err := websocket.DefaultDialer.Dial(bad, nil); err == nil {
		t.Fatal("unknown ticket accepted")
	}
}
