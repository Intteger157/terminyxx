package rdpdrive

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/gorilla/websocket"
)

func frame(t *testing.T, req Request) []byte {
	t.Helper()
	data := req.Data
	req.Data = nil
	head, err := json.Marshal(req)
	if err != nil {
		t.Fatal(err)
	}
	out := binary.LittleEndian.AppendUint32(nil, uint32(len(head)))
	return append(append(out, head...), data...)
}

func readReply(t *testing.T, ws *websocket.Conn) Reply {
	t.Helper()
	_, msg, err := ws.ReadMessage()
	if err != nil {
		t.Fatal(err)
	}
	n := binary.LittleEndian.Uint32(msg)
	var r Reply
	if err := json.Unmarshal(msg[4:4+n], &r); err != nil {
		t.Fatal(err)
	}
	r.Data = msg[4+n:]
	return r
}

func TestServeOverWebSocket(t *testing.T) {
	s, dir := newSession(t, false)
	var locked atomic.Bool
	var trace bytes.Buffer
	done := make(chan struct{})
	upgrader := websocket.Upgrader{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ws, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer ws.Close()
		Serve(s, ws, locked.Load, &trace, nil)
		close(done)
	}))
	defer srv.Close()
	ws, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(srv.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer ws.Close()
	send := func(req Request) {
		if err := ws.WriteMessage(websocket.BinaryMessage, frame(t, req)); err != nil {
			t.Fatal(err)
		}
	}

	send(Request{ID: 1, Op: "create", DeviceID: dev, Path: `\a.bin`, Disposition: fileCreate, DesiredAccess: rw})
	created := readReply(t, ws)
	if created.Status != StatusSuccess || created.Stat == nil || created.Stat.Dir {
		t.Fatalf("create: %+v", created)
	}
	payload := []byte{0, 1, 2, 0xff, 'x'}
	send(Request{ID: 2, Op: "write", DeviceID: dev, FileID: created.FileID, Data: payload})
	if r := readReply(t, ws); r.Length != uint32(len(payload)) {
		t.Fatalf("write: %+v", r)
	}
	send(Request{ID: 3, Op: "read", DeviceID: dev, FileID: created.FileID, Length: 10})
	if r := readReply(t, ws); string(r.Data) != string(payload) {
		t.Fatalf("read: %q", r.Data)
	}
	// A close without an ID gets no reply but is done before the next request.
	send(Request{ID: 0, Op: "close", DeviceID: dev, FileID: created.FileID})
	send(Request{ID: 4, Op: "stat", DeviceID: dev, FileID: created.FileID})
	if r := readReply(t, ws); r.ID != 4 || r.Status != StatusInvalidHandle {
		t.Fatalf("stat after close: %+v", r)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "a.bin")); string(b) != string(payload) {
		t.Fatalf("file = %q", b)
	}

	locked.Store(true)
	send(Request{ID: 5, Op: "create", DeviceID: dev, Path: `\a.bin`, Disposition: fileOpen})
	if r := readReply(t, ws); r.Status != StatusAccessDenied {
		t.Fatalf("while locked: %+v", r)
	}

	ws.Close()
	<-done
	if out := trace.String(); !strings.Contains(out, "write") || !strings.Contains(out, "summary") {
		t.Fatalf("trace: %s", out)
	}
}

func TestServeKeepsOrderPerHandleUnderLoad(t *testing.T) {
	s, dir := newSession(t, false)
	upgrader := websocket.Upgrader{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ws, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer ws.Close()
		Serve(s, ws, nil, nil, nil)
	}))
	defer srv.Close()
	ws, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(srv.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer ws.Close()
	send := func(req Request) {
		if err := ws.WriteMessage(websocket.BinaryMessage, frame(t, req)); err != nil {
			t.Fatal(err)
		}
	}
	// Open 8 files at once.
	const files = 8
	for i := 0; i < files; i++ {
		send(Request{ID: uint32(i + 1), Op: "create", DeviceID: dev, Path: `\f` + string(rune('a'+i)), Disposition: fileCreate, DesiredAccess: rw})
	}
	ids := map[uint32]uint32{} // request id -> file id
	for i := 0; i < files; i++ {
		r := readReply(t, ws)
		if r.Status != StatusSuccess {
			t.Fatalf("create: %+v", r)
		}
		ids[r.ID] = r.FileID
	}
	// Interleave writes that only give the right content in order (each
	// truncates and rewrites), then close without a reply and stat.
	next := uint32(100)
	for round := 0; round < 20; round++ {
		for i := uint32(1); i <= files; i++ {
			send(Request{ID: next, Op: "setSize", DeviceID: dev, FileID: ids[i], Size: 0})
			send(Request{ID: next + 1, Op: "write", DeviceID: dev, FileID: ids[i], Data: []byte{byte(round)}})
			next += 2
		}
	}
	for i := uint32(1); i <= files; i++ {
		send(Request{ID: 0, Op: "close", DeviceID: dev, FileID: ids[i]})
		send(Request{ID: next, Op: "stat", DeviceID: dev, FileID: ids[i]})
		next++
	}
	invalid := 0
	for n := uint32(0); n < 20*files*2+files; n++ {
		if r := readReply(t, ws); r.Status == StatusInvalidHandle {
			invalid++
		}
	}
	if invalid != files {
		t.Fatalf("stat after close: %d invalid, want %d", invalid, files)
	}
	for i := 0; i < files; i++ {
		b, _ := os.ReadFile(filepath.Join(dir, "f"+string(rune('a'+i))))
		if len(b) != 1 || b[0] != 19 {
			t.Fatalf("file %d = %v", i, b)
		}
	}
}
