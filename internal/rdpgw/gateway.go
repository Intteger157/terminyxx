package rdpgw

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"errors"
	"fmt"

	"log"
	"net"
	"net/http"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

const (
	ticketTTL   = time.Minute
	dialTimeout = 15 * time.Second
	// maxMessage bounds one WebSocket message from the client.
	maxMessage = 16 << 20
)

// Gateway serves the RDCleanPath WebSocket on 127.0.0.1. Each session needs
// a single-use ticket issued by the app for one tab and one destination, so
// nothing else on the machine can use it as an open relay.
type Gateway struct {
	trust *TrustStore

	mu       sync.Mutex
	ln       net.Listener
	srv      *http.Server
	stopped  bool
	attempts map[string]*Attempt
	tickets  map[string]*ticket
	live     map[string]*liveSession // by tab id
	errs     map[string]string       // last failure by tab id

	chTickets map[string]*channelTicket
	channels  map[string]*websocket.Conn // by attempt ID
}

type ticket struct {
	attempt *Attempt
	host    string
	port    int
	expires time.Time
}

// Attempt identifies a connection from its certificate probe through relay.
// Replacing or closing an attempt cancels its context.
type Attempt struct {
	g            *Gateway
	id           string
	ctx          context.Context
	cancel       context.CancelFunc
	driveCleanup func()
	relayIssued  bool
	driveIssued  bool
}

type closedAttempt struct {
	relay        *liveSession
	driveCleanup func()
}

func (c closedAttempt) close() {
	if c.relay != nil {
		c.relay.close()
	}
	if c.driveCleanup != nil {
		c.driveCleanup()
	}
}

type liveSession struct {
	ws   *websocket.Conn
	conn *tls.Conn

	// Traffic, for diagnostics: bytes relayed each way, and when the write
	// in progress started (0 when none), which shows a side that stopped reading.
	up, down           atomic.Int64
	upSince, downSince atomic.Int64
}

// Traffic reports the bytes relayed for tabID's session (up is client to
// server) and how long a write has been waiting in each direction.
func (g *Gateway) Traffic(tabID string) (up, down int64, upStall, downStall time.Duration, ok bool) {
	g.mu.Lock()
	l := g.live[tabID]
	active := l != nil && l.conn != nil
	g.mu.Unlock()
	if !active {
		return 0, 0, 0, 0, false
	}
	stall := func(since int64) time.Duration {
		if since == 0 {
			return 0
		}
		return time.Since(time.Unix(0, since))
	}
	return l.up.Load(), l.down.Load(), stall(l.upSince.Load()), stall(l.downSince.Load()), true
}

// TCPInfo describes the TCP connection of tabID's session to the server, for
// the drive trace.
func (g *Gateway) TCPInfo(tabID string) string {
	g.mu.Lock()
	var conn *tls.Conn
	if l := g.live[tabID]; l != nil {
		conn = l.conn
	}
	g.mu.Unlock()
	if conn == nil {
		return ""
	}
	return tcpInfo(conn)
}

func (l *liveSession) close() {
	if l.ws != nil {
		_ = l.ws.Close()
	}
	if l.conn != nil {
		_ = l.conn.NetConn().Close()
	}
}

func New(trust *TrustStore) *Gateway {
	return &Gateway{trust: trust, attempts: map[string]*Attempt{}, tickets: map[string]*ticket{}, live: map[string]*liveSession{}, errs: map[string]string{}}
}

func (g *Gateway) Trust() *TrustStore { return g.trust }

// ensureListening starts the HTTP server on first use.
func (g *Gateway) ensureListening() (string, error) {
	if g.ln != nil {
		return g.ln.Addr().String(), nil
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", err
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/rdp", g.serveWS)
	mux.HandleFunc("/channel", g.serveChannel)
	g.ln = ln
	g.srv = &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	go func() { _ = g.srv.Serve(ln) }()
	return ln.Addr().String(), nil
}

// Begin registers the attempt before the certificate probe can start.
func (g *Gateway) Begin(parent context.Context, id string) *Attempt {
	ctx, cancel := context.WithCancel(parent)
	a := &Attempt{g: g, id: id, ctx: ctx, cancel: cancel}
	g.mu.Lock()
	old := g.closeLocked(id)
	if g.stopped {
		cancel()
	} else {
		g.attempts[id] = a
	}
	g.mu.Unlock()
	old.close()
	return a
}

func (a *Attempt) Context() context.Context { return a.ctx }

// Close revokes this attempt if it is still current.
func (a *Attempt) Close() {
	g := a.g
	g.mu.Lock()
	var closed closedAttempt
	if g.attempts[a.id] == a {
		closed = g.closeLocked(a.id)
	}
	g.mu.Unlock()
	closed.close()
}

// Issue creates a ticket to reach host:port and returns the
// WebSocket URL and the token the client must send as proxy_auth.
func (a *Attempt) Issue(host string, port int) (url, token string, err error) {
	g := a.g
	g.mu.Lock()
	defer g.mu.Unlock()
	if err := a.ctx.Err(); err != nil {
		return "", "", err
	}
	if a.relayIssued {
		return "", "", errors.New("RDP ticket already issued")
	}
	addr, err := g.ensureListening()
	if err != nil {
		return "", "", err
	}
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", "", err
	}
	token = hex.EncodeToString(buf)
	now := time.Now()
	for k, t := range g.tickets {
		if now.After(t.expires) || t.attempt == a {
			delete(g.tickets, k)
		}
	}
	g.tickets[token] = &ticket{attempt: a, host: host, port: port, expires: now.Add(ticketTTL)}
	a.relayIssued = true
	delete(g.errs, a.id)
	return "ws://" + addr + "/rdp", token, nil
}

func (g *Gateway) take(token string, ws *websocket.Conn) (*ticket, *liveSession) {
	g.mu.Lock()
	defer g.mu.Unlock()
	for k, t := range g.tickets {
		if subtle.ConstantTimeCompare([]byte(k), []byte(token)) == 1 {
			delete(g.tickets, k)
			if time.Now().After(t.expires) || t.attempt.ctx.Err() != nil || g.live[t.attempt.id] != nil {
				return nil, nil
			}
			l := &liveSession{ws: ws}
			g.live[t.attempt.id] = l
			return t, l
		}
	}
	return nil, nil
}

// LastError returns why the most recent session of tabID failed on the
// gateway side (the client only learns an error code).
func (g *Gateway) LastError(tabID string) string {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.errs[tabID]
}

func (a *Attempt) setErr(err error) {
	g := a.g
	g.mu.Lock()
	if g.attempts[a.id] == a {
		g.errs[a.id] = err.Error()
	}
	g.mu.Unlock()
}

// Close ends the session of tabID, if any.
func (g *Gateway) Close(tabID string) {
	g.mu.Lock()
	closed := g.closeLocked(tabID)
	g.mu.Unlock()
	closed.close()
}

func (g *Gateway) closeLocked(tabID string) closedAttempt {
	c := closedAttempt{relay: g.live[tabID]}
	if a := g.attempts[tabID]; a != nil {
		a.cancel()
		c.driveCleanup = a.driveCleanup
		delete(g.attempts, tabID)
	}
	delete(g.live, tabID)
	delete(g.errs, tabID)
	for k, t := range g.tickets {
		if t.attempt.id == tabID {
			delete(g.tickets, k)
		}
	}
	g.closeChannelsLocked(tabID)
	return c
}

// Shutdown closes every session and the listener.
func (g *Gateway) Shutdown() {
	g.mu.Lock()
	g.stopped = true
	var closed []closedAttempt
	for id := range g.attempts {
		closed = append(closed, g.closeLocked(id))
	}
	srv := g.srv
	g.mu.Unlock()
	for _, attempt := range closed {
		attempt.close()
	}
	if srv != nil {
		_ = srv.Close()
	}
}

// Probe connects to the server, negotiates TLS and returns its certificate
// chain without starting a session.
func Probe(ctx context.Context, host string, port int) ([]*x509.Certificate, error) {
	conn, _, neg, err := dialServer(ctx, host, port, probeConnectionRequest())
	if err != nil {
		return nil, err
	}
	if neg.failed {
		return nil, errors.New(negotiationFailureText(neg.code))
	}
	defer conn.Close()
	return conn.ConnectionState().PeerCertificates, nil
}

// dialServer sends the X.224 connection request and, if the server selected
// TLS or CredSSP, upgrades to TLS. The returned conn is nil when negotiation
// failed; resp is the server's X.224 confirm either way.
func dialServer(ctx context.Context, host string, port int, x224 []byte) (*tls.Conn, []byte, negotiation, error) {
	ctx, cancel := context.WithTimeout(ctx, dialTimeout)
	defer cancel()
	d := net.Dialer{KeepAlive: 30 * time.Second}
	raw, err := d.DialContext(ctx, "tcp", net.JoinHostPort(host, strconv.Itoa(port)))
	if err != nil {
		return nil, nil, negotiation{}, &dialError{err}
	}
	stop := context.AfterFunc(ctx, func() { _ = raw.SetDeadline(time.Now()) })
	defer stop()

	if _, err := raw.Write(x224); err != nil {
		raw.Close()
		return nil, nil, negotiation{}, err
	}
	resp, err := readTPKT(raw)
	if err != nil {
		raw.Close()
		return nil, nil, negotiation{}, fmt.Errorf("read connection confirm: %w", err)
	}
	neg, err := parseConnectionConfirm(resp)
	if err != nil {
		raw.Close()
		return nil, nil, negotiation{}, err
	}
	if neg.failed {
		raw.Close()
		return nil, resp, neg, nil
	}
	if neg.selected == protocolRDP {
		raw.Close()
		return nil, nil, neg, errors.New("the server only offers legacy RDP security without TLS, which the built-in client does not support")
	}
	cfg := &tls.Config{
		// The chain is checked against the trust store right after the
		// handshake (TrustStore.Check), since RDP servers are usually
		// self-signed.
		InsecureSkipVerify: true, //nolint:gosec
		MinVersion:         tls.VersionTLS12,
		// Windows' RDP server completes a TLS 1.3 handshake and then sends
		// an internal_error alert, so CredSSP never starts (it logs a
		// misleading ERROR_LOGON_FAILURE). mstsc and Windows App use 1.2.
		MaxVersion: tls.VersionTLS12,
	}
	if net.ParseIP(host) == nil {
		cfg.ServerName = host
	}
	tc := tls.Client(raw, cfg)
	if err := tc.HandshakeContext(ctx); err != nil {
		raw.Close()
		return nil, nil, neg, &tlsError{err}
	}
	return tc, resp, neg, nil
}

type dialError struct{ err error }

func (e *dialError) Error() string { return e.err.Error() }
func (e *dialError) Unwrap() error { return e.err }

type tlsError struct{ err error }

func (e *tlsError) Error() string { return "TLS handshake failed: " + e.err.Error() }
func (e *tlsError) Unwrap() error { return e.err }

var upgrader = websocket.Upgrader{
	ReadBufferSize:   64 << 10,
	WriteBufferSize:  64 << 10,
	HandshakeTimeout: 5 * time.Second,
	// The single-use ticket authorizes the session; the page origin differs
	// between platforms and wails dev.
	CheckOrigin: func(*http.Request) bool { return true },
}

func (g *Gateway) serveWS(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	ws.SetReadLimit(maxMessage)
	if err := g.session(ws); err != nil && !errors.Is(err, context.Canceled) {
		log.Printf("rdpgw: %v", err)
	}
}

func (g *Gateway) session(ws *websocket.Conn) error {
	defer ws.Close()
	_ = ws.SetReadDeadline(time.Now().Add(30 * time.Second))
	var buf []byte
	for {
		mt, data, err := ws.ReadMessage()
		if err != nil {
			return err
		}
		if mt != websocket.BinaryMessage {
			return errors.New("unexpected text message")
		}
		buf = append(buf, data...)
		n, err := derLength(buf)
		if err != nil {
			return err
		}
		if n > maxMessage {
			return errors.New("RDCleanPath request too large")
		}
		if n > 0 && len(buf) >= n {
			if len(buf) > n {
				return errors.New("data after the RDCleanPath request")
			}
			break
		}
	}
	_ = ws.SetReadDeadline(time.Time{})

	req, err := decodePDU(buf)
	if err != nil {
		return err
	}
	t, l := g.take(req.ProxyAuth, ws)
	if t == nil {
		_ = ws.WriteMessage(websocket.BinaryMessage, encodeError(pduError{Code: errGeneral, HTTPStatus: 401}))
		return errors.New("invalid or expired ticket")
	}
	a := t.attempt
	defer func() {
		g.mu.Lock()
		if g.live[a.id] == l {
			delete(g.live, a.id)
		}
		g.mu.Unlock()
	}()
	fail := func(code int, e error) error {
		if err := a.ctx.Err(); err != nil {
			return err
		}
		a.setErr(e)
		_ = ws.WriteMessage(websocket.BinaryMessage, encodeError(pduError{Code: code}))
		return e
	}
	if req.PreconnectionBlob != "" || !validConnectionRequest(req.X224) {
		return fail(errGeneral, errors.New("unsupported connection request"))
	}

	conn, resp, neg, err := dialServer(a.ctx, t.host, t.port, req.X224)
	if err != nil {
		var de *dialError
		var te *tlsError
		var dnsErr *net.DNSError
		switch {
		case errors.As(err, &dnsErr):
			return fail(errDNSFailed, fmt.Errorf("could not resolve %s", t.host))
		case errors.As(err, &de):
			return fail(errTargetUnreachable, err)
		case errors.As(err, &te):
			return fail(errTLSFailed, err)
		}
		return fail(errGeneral, err)
	}
	if neg.failed {
		a.setErr(errors.New(negotiationFailureText(neg.code)))
		_ = ws.WriteMessage(websocket.BinaryMessage, encodeNegotiationError(resp))
		return nil
	}
	defer conn.Close()
	g.mu.Lock()
	err = a.ctx.Err()
	if err == nil {
		l.conn = conn
	}
	g.mu.Unlock()
	if err != nil {
		return err
	}

	dest := net.JoinHostPort(t.host, strconv.Itoa(t.port))
	certs := conn.ConnectionState().PeerCertificates
	if err := g.trust.Check(dest, t.host, certs); err != nil {
		return fail(errUntrusted, err)
	}
	chain := make([][]byte, len(certs))
	for i, c := range certs {
		chain[i] = c.Raw
	}
	out, err := encodeResponse(conn.RemoteAddr().String(), resp, chain)
	if err != nil {
		return fail(errGeneral, err)
	}
	if err := ws.WriteMessage(websocket.BinaryMessage, out); err != nil {
		return err
	}
	relay(ws, conn, l)
	return nil
}

// relay copies the RDP stream both ways until either side closes.
func relay(ws *websocket.Conn, conn net.Conn, l *liveSession) {
	start := time.Now()
	if traceEnabled {
		log.Printf("rdptrace: relay started")
	}
	up := &signInTracer{dir: "client->server"}
	down := &signInTracer{dir: "server->client"}
	done := make(chan struct{}, 2)
	go func() {
		defer func() { done <- struct{}{} }()
		for {
			mt, data, err := ws.ReadMessage()
			if err != nil {
				if traceEnabled {
					log.Printf("rdptrace client->server: websocket ended after %v: %v", time.Since(start), err)
				}
				return
			}
			if mt != websocket.BinaryMessage {
				if traceEnabled {
					log.Printf("rdptrace client->server: ignored message type %d (%dB)", mt, len(data))
				}
				continue
			}
			up.feed(data)
			l.upSince.Store(time.Now().UnixNano())
			_, err = conn.Write(data)
			l.upSince.Store(0)
			if err != nil {
				return
			}
			l.up.Add(int64(len(data)))
		}
	}()
	go func() {
		defer func() { done <- struct{}{} }()
		buf := make([]byte, 64<<10)
		for {
			n, err := conn.Read(buf)
			if n > 0 {
				down.feed(buf[:n])
				l.downSince.Store(time.Now().UnixNano())
				werr := ws.WriteMessage(websocket.BinaryMessage, buf[:n])
				l.downSince.Store(0)
				if werr != nil {
					return
				}
				l.down.Add(int64(n))
			}
			if err != nil {
				if traceEnabled && !down.done {
					log.Printf("rdptrace server->client: connection ended during sign-in after %v: %v", time.Since(start), err)
				}
				_ = ws.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""), time.Now().Add(time.Second))
				return
			}
		}
	}()
	<-done
	_ = conn.Close()
	_ = ws.Close()
	<-done
}
