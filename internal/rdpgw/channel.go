package rdpgw

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

// Side channels are extra WebSockets between the built-in client and the app
// that bypass the Wails bridge, whose replies go through the window's UI
// thread and are too slow for chatty traffic such as drive redirection. Each
// needs a single-use ticket for one tab, like the RDP relay.

const channelTicketTTL = 5 * time.Minute

type channelTicket struct {
	attempt *Attempt
	handler ChannelHandler
	expires time.Time
}

// ChannelHandler serves one side channel until ws closes.
type ChannelHandler func(ctx context.Context, ws *websocket.Conn)

// IssueChannel binds a single-use URL to this attempt's drive session.
// On success the attempt owns cleanup.
func (a *Attempt) IssueChannel(handler ChannelHandler, cleanup func()) (string, error) {
	g := a.g
	g.mu.Lock()
	defer g.mu.Unlock()
	if err := a.ctx.Err(); err != nil {
		return "", err
	}
	if a.driveIssued || handler == nil {
		return "", errors.New("cannot issue RDP drive ticket")
	}
	addr, err := g.ensureListening()
	if err != nil {
		return "", err
	}
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	token := hex.EncodeToString(buf)
	now := time.Now()
	if g.chTickets == nil {
		g.chTickets = map[string]*channelTicket{}
	}
	for k, t := range g.chTickets {
		if now.After(t.expires) || t.attempt == a {
			delete(g.chTickets, k)
		}
	}
	g.chTickets[token] = &channelTicket{attempt: a, handler: handler, expires: now.Add(channelTicketTTL)}
	a.driveCleanup = cleanup
	a.driveIssued = true
	return "ws://" + addr + "/channel?t=" + token, nil
}

func (g *Gateway) takeChannel(token string) *channelTicket {
	g.mu.Lock()
	defer g.mu.Unlock()
	for k, t := range g.chTickets {
		if subtle.ConstantTimeCompare([]byte(k), []byte(token)) == 1 {
			delete(g.chTickets, k)
			if time.Now().After(t.expires) || t.attempt.ctx.Err() != nil {
				return nil
			}
			return t
		}
	}
	return nil
}

func (g *Gateway) serveChannel(w http.ResponseWriter, r *http.Request) {
	t := g.takeChannel(r.URL.Query().Get("t"))
	if t == nil {
		http.Error(w, "invalid ticket", http.StatusUnauthorized)
		return
	}
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	ws.SetReadLimit(maxMessage)
	a := t.attempt
	g.mu.Lock()
	if a.ctx.Err() != nil {
		g.mu.Unlock()
		_ = ws.Close()
		return
	}
	if g.channels == nil {
		g.channels = map[string]*websocket.Conn{}
	}
	g.channels[a.id] = ws
	g.mu.Unlock()
	defer func() {
		_ = ws.Close()
		g.mu.Lock()
		if g.channels[a.id] == ws {
			delete(g.channels, a.id)
		}
		g.mu.Unlock()
	}()
	t.handler(a.ctx, ws)
}

// closeChannelsLocked closes the side channels of tabID. The caller holds g.mu.
func (g *Gateway) closeChannelsLocked(tabID string) {
	if c := g.channels[tabID]; c != nil {
		_ = c.Close()
	}
	delete(g.channels, tabID)
	for k, t := range g.chTickets {
		if t.attempt.id == tabID {
			delete(g.chTickets, k)
		}
	}
}
