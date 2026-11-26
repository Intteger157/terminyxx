package rdpdrive

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// The webview sends requests over a WebSocket side channel (see
// rdpgw.IssueChannel) and gets the replies back on it, one binary message
// each: a little-endian uint32 header length, the JSON header (a Request or
// Reply without its data), then the raw data bytes. Requests for the same
// handle stay in order, including requests that take no reply (ID 0).

var errFrame = errors.New("malformed frame")

func decodeRequest(msg []byte) (Request, error) {
	var req Request
	if len(msg) < 4 {
		return req, errFrame
	}
	n := binary.LittleEndian.Uint32(msg)
	if uint64(n) > uint64(len(msg)-4) {
		return req, errFrame
	}
	if err := json.Unmarshal(msg[4:4+n], &req); err != nil {
		return req, err
	}
	req.Data = msg[4+n:]
	return req, nil
}

func encodeReply(r Reply) ([]byte, error) {
	data := r.Data
	r.Data = nil
	header, err := json.Marshal(r)
	if err != nil {
		return nil, err
	}
	out := make([]byte, 4, 4+len(header)+len(data))
	binary.LittleEndian.PutUint32(out, uint32(len(header)))
	out = append(out, header...)
	return append(out, data...), nil
}

// Serve answers the requests that arrive on ws until it closes. While locked
// reports true, every request is refused. With a trace writer, each request is
// logged with how long it waited for the client (gap since the previous reply)
// and how long it took here, and a summary per operation is written at the end.
//
// Requests for one handle run in the order they arrive (a close without a
// reply must finish before the next request on that handle); requests for
// different handles, and creates, run concurrently, so a file that takes
// seconds to open (an antivirus scanning an executable) doesn't stall the rest.
//
// With a trace writer, pulse (if set) is logged every 2 seconds, so the trace
// shows whether the rest of the session is still moving.
func Serve(parent context.Context, s *Session, ws *websocket.Conn, locked func() bool, trace io.Writer, pulse func() string) {
	ws.SetReadLimit(16 << 20)
	ctx, cancel := context.WithCancel(parent)
	stopClose := context.AfterFunc(ctx, func() { _ = ws.Close() })
	d := &dispatcher{
		ctx:    ctx,
		s:      s,
		ws:     ws,
		locked: locked,
		t:      newTracer(trace),
		queues: map[uint32][]queuedRequest{},
		slots:  make(chan struct{}, maxConcurrent),
	}
	defer func() {
		cancel()
		stopClose()
		_ = ws.Close()
		d.wg.Wait()
		d.t.summary()
	}()
	if trace != nil && pulse != nil {
		stop := make(chan struct{})
		defer close(stop)
		go func() {
			tick := time.NewTicker(2 * time.Second)
			defer tick.Stop()
			for {
				select {
				case <-stop:
					return
				case <-tick.C:
					d.t.log(Request{Op: "note", Path: "pulse " + pulse()}, Reply{}, time.Now())
					d.t.flush()
				}
			}
		}()
	}
	for {
		mt, msg, err := ws.ReadMessage()
		if err != nil {
			return
		}
		if mt != websocket.BinaryMessage {
			continue
		}
		req, err := decodeRequest(msg)
		if err != nil || ctx.Err() != nil {
			return
		}
		switch req.Op {
		case "reset":
			start := time.Now()
			status := StatusSuccess
			if locked != nil && locked() {
				status = StatusAccessDenied
			} else {
				s.Reset()
			}
			d.t.log(req, Reply{Status: status}, start)
		case "note":
			// A trace line from the client: the IRPs it sees and its replies.
			d.t.log(req, Reply{}, time.Now())
		default:
			size := len(msg)
			if req.Op == "read" && req.Length <= MaxRead {
				size += int(req.Length)
			}
			if !d.submit(queuedRequest{req: req, size: size}) {
				_ = ws.WriteControl(websocket.CloseMessage,
					websocket.FormatCloseMessage(websocket.CloseTryAgainLater, "shared folder queue is full"),
					time.Now().Add(time.Second))
				return
			}
		}
	}
}

const (
	maxConcurrent      = 16
	maxPendingRequests = 512
	maxPendingBytes    = 64 << 20
)

type queuedRequest struct {
	req  Request
	size int
}

type dispatcher struct {
	ctx    context.Context
	s      *Session
	ws     *websocket.Conn
	locked func() bool
	t      *tracer
	wg     sync.WaitGroup
	slots  chan struct{}

	wmu sync.Mutex // serializes writes to ws

	mu           sync.Mutex
	queues       map[uint32][]queuedRequest // per handle; present while one runs
	pending      int
	pendingBytes int
}

// Admission accounts for running requests too, including replies waiting to
// be sent. Closing the channel on overflow preserves per-handle ordering.
func (d *dispatcher) admit(size int) bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.pending >= maxPendingRequests || size > maxPendingBytes-d.pendingBytes {
		return false
	}
	d.pending++
	d.pendingBytes += size
	return true
}

func (d *dispatcher) submit(job queuedRequest) bool {
	if !d.admit(job.size) {
		return false
	}
	if job.req.Op == "create" {
		d.wg.Go(func() { d.run(job) })
		return true
	}
	id := job.req.FileID
	d.mu.Lock()
	q, busy := d.queues[id]
	d.queues[id] = append(q, job)
	d.mu.Unlock()
	if busy {
		return true
	}
	d.wg.Go(func() {
		for {
			d.mu.Lock()
			q := d.queues[id]
			if len(q) == 0 {
				delete(d.queues, id)
				d.mu.Unlock()
				return
			}
			next := q[0]
			q[0] = queuedRequest{}
			d.queues[id] = q[1:]
			d.mu.Unlock()
			d.run(next)
		}
	})
	return true
}

func (d *dispatcher) run(job queuedRequest) {
	defer func() {
		d.mu.Lock()
		d.pending--
		d.pendingBytes -= job.size
		d.mu.Unlock()
	}()
	select {
	case <-d.ctx.Done():
		return
	case d.slots <- struct{}{}:
	}
	defer func() { <-d.slots }()
	if d.ctx.Err() != nil {
		return
	}
	req := job.req
	start := time.Now()
	var reply Reply
	if d.locked != nil && d.locked() {
		reply = Reply{ID: req.ID, Status: StatusAccessDenied}
	} else {
		reply = d.s.Do(req)
	}
	d.t.log(req, reply, start)
	if req.ID == 0 {
		return
	}
	out, err := encodeReply(reply)
	if err != nil {
		return
	}
	d.wmu.Lock()
	defer d.wmu.Unlock()
	if d.ctx.Err() != nil {
		return
	}
	_ = d.ws.SetWriteDeadline(time.Now().Add(15 * time.Second))
	if err := d.ws.WriteMessage(websocket.BinaryMessage, out); err != nil {
		_ = d.ws.Close()
	}
}

type opStats struct {
	count     int
	here, gap time.Duration
	bytes     int
}

type tracer struct {
	mu    sync.Mutex
	w     io.Writer
	begin time.Time
	last  time.Time
	ops   map[string]*opStats
}

func newTracer(w io.Writer) *tracer {
	now := time.Now()
	t := &tracer{w: w, begin: now, last: now, ops: map[string]*opStats{}}
	if w != nil {
		fmt.Fprintf(w, "--- drive session %s\n", now.Format(time.RFC3339))
	}
	return t
}

func (t *tracer) log(req Request, reply Reply, start time.Time) {
	if t.w == nil {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	end := time.Now()
	gap, here := max(start.Sub(t.last), 0), end.Sub(start)
	t.last = end
	st := t.ops[req.Op]
	if st == nil {
		st = &opStats{}
		t.ops[req.Op] = st
	}
	st.count++
	st.here += here
	st.gap += gap
	st.bytes += len(req.Data) + len(reply.Data)
	detail := req.Path
	switch req.Op {
	case "read":
		detail = fmt.Sprintf("off=%.0f len=%d got=%d", req.Offset, req.Length, len(reply.Data))
	case "write":
		detail = fmt.Sprintf("off=%.0f len=%d", req.Offset, len(req.Data))
	case "rename":
		detail = req.To
	case "list":
		detail = fmt.Sprintf("%s entries=%d", req.Path, len(reply.Entries))
	}
	fmt.Fprintf(t.w, "%9.3fs gap=%7.1fms here=%6.1fms #%d %-9s file=%d %s -> %#x\n",
		end.Sub(t.begin).Seconds(), ms64(gap), ms64(here), req.ID, req.Op, req.FileID, detail, reply.Status)
}

// flush writes buffered trace lines out, so the log can be read live.
func (t *tracer) flush() {
	if f, ok := t.w.(interface{ Flush() error }); ok {
		t.mu.Lock()
		_ = f.Flush()
		t.mu.Unlock()
	}
}

func (t *tracer) summary() {
	if t.w == nil {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	names := make([]string, 0, len(t.ops))
	for k := range t.ops {
		names = append(names, k)
	}
	sort.Strings(names)
	fmt.Fprintf(t.w, "--- summary after %.1fs\n", time.Since(t.begin).Seconds())
	for _, k := range names {
		st := t.ops[k]
		fmt.Fprintf(t.w, "%-9s n=%-6d here=%8.1fms gap=%9.1fms bytes=%d\n", k, st.count, ms64(st.here), ms64(st.gap), st.bytes)
	}
}

func ms64(d time.Duration) float64 { return float64(d.Microseconds()) / 1000 }
