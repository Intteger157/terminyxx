package rdpgw

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
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
	tabID   string
	name    string
	expires time.Time
}

// ChannelHandler serves one side channel until ws closes.
type ChannelHandler func(tabID string, ws *websocket.Conn)

// SetChannelHandler registers the handler of the side channel name.
func (g *Gateway) SetChannelHandler(name string, h ChannelHandler) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.handlers == nil {
		g.handlers = map[string]ChannelHandler{}
	}
	g.handlers[name] = h
}

// IssueChannel returns the URL that opens side channel name for tabID; the
// token in it works once and expires after a few minutes.
func (g *Gateway) IssueChannel(tabID, name string) (string, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
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
		if now.After(t.expires) || (t.tabID == tabID && t.name == name) {
			delete(g.chTickets, k)
		}
	}
	g.chTickets[token] = &channelTicket{tabID: tabID, name: name, expires: now.Add(channelTicketTTL)}
	return "ws://" + addr + "/channel?t=" + token, nil
}

func (g *Gateway) takeChannel(token string) (*channelTicket, ChannelHandler) {
	g.mu.Lock()
	defer g.mu.Unlock()
	for k, t := range g.chTickets {
		if subtle.ConstantTimeCompare([]byte(k), []byte(token)) == 1 {
			delete(g.chTickets, k)
			if time.Now().After(t.expires) {
				return nil, nil
			}
			return t, g.handlers[t.name]
		}
	}
	return nil, nil
}

func (g *Gateway) serveChannel(w http.ResponseWriter, r *http.Request) {
	t, h := g.takeChannel(r.URL.Query().Get("t"))
	if t == nil || h == nil {
		http.Error(w, "invalid ticket", http.StatusUnauthorized)
		return
	}
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	ws.SetReadLimit(maxMessage)
	g.mu.Lock()
	if g.channels == nil {
		g.channels = map[string][]*websocket.Conn{}
	}
	g.channels[t.tabID] = append(g.channels[t.tabID], ws)
	g.mu.Unlock()
	defer func() {
		_ = ws.Close()
		g.mu.Lock()
		list := g.channels[t.tabID]
		for i, c := range list {
			if c == ws {
				g.channels[t.tabID] = append(list[:i], list[i+1:]...)
				break
			}
		}
		if len(g.channels[t.tabID]) == 0 {
			delete(g.channels, t.tabID)
		}
		g.mu.Unlock()
	}()
	h(t.tabID, ws)
}

// closeChannels closes the side channels of tabID, or of every tab when
// tabID is empty. The caller holds g.mu.
func (g *Gateway) closeChannelsLocked(tabID string) {
	for tab, list := range g.channels {
		if tabID != "" && tab != tabID {
			continue
		}
		for _, c := range list {
			_ = c.Close()
		}
	}
	for k, t := range g.chTickets {
		if tabID == "" || t.tabID == tabID {
			delete(g.chTickets, k)
		}
	}
}
