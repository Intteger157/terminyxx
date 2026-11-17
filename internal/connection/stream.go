package connection

import (
	"errors"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"

	"go.bug.st/serial"
	"terminyxx/internal/recording"
)

// Stream kinds.
const (
	StreamTelnet = "telnet"
	StreamSerial = "serial"
)

// StreamRequest opens a raw terminal stream that is not SSH: a Telnet
// session or a serial port.
type StreamRequest struct {
	ID   string `json:"id"`
	Kind string `json:"kind"` // "telnet" | "serial"

	Host string `json:"host"`
	Port int    `json:"port"`

	Device   string `json:"device"`   // COM3, /dev/tty.usbserial-0001
	Baud     int    `json:"baud"`     // default 9600
	DataBits int    `json:"dataBits"` // 5-8, default 8
	Parity   string `json:"parity"`   // none | even | odd | mark | space
	StopBits string `json:"stopBits"` // 1 | 1.5 | 2
}

// streamConn is one Telnet or serial session. It looks like an SSH shell to
// the UI: the same output and state events.
type streamConn struct {
	id      string
	kind    string
	rw      io.ReadWriteCloser
	telnet  *telnetConn
	emitter EventEmitter
	pipe    *outputPipe

	rec atomic.Pointer[recording.Recorder]

	wmu       sync.Mutex
	startOnce sync.Once
	closeOnce sync.Once
	done      chan struct{}
	onClosed  func()
}

var dialTelnet = func(addr string) (net.Conn, error) {
	return net.DialTimeout("tcp", addr, dialTimeout)
}

// ListSerialPorts returns the serial devices present on this machine.
func ListSerialPorts() ([]string, error) {
	ports, err := serial.GetPortsList()
	if err != nil {
		return []string{}, err
	}
	if ports == nil {
		ports = []string{}
	}
	return ports, nil
}

func openStream(req StreamRequest) (rw io.ReadWriteCloser, tn *telnetConn, err error) {
	switch req.Kind {
	case StreamTelnet:
		if strings.TrimSpace(req.Host) == "" {
			return nil, nil, errors.New("host is required")
		}
		port := req.Port
		if port == 0 {
			port = 23
		}
		c, err := dialTelnet(net.JoinHostPort(req.Host, strconv.Itoa(port)))
		if err != nil {
			return nil, nil, err
		}
		tn = newTelnetConn(c)
		return tn, tn, nil
	case StreamSerial:
		mode, err := serialMode(req)
		if err != nil {
			return nil, nil, err
		}
		if req.Device == "" {
			return nil, nil, errors.New("serial port is required")
		}
		p, err := serial.Open(req.Device, mode)
		if err != nil {
			return nil, nil, fmt.Errorf("open %s: %w", req.Device, err)
		}
		return p, nil, nil
	}
	return nil, nil, fmt.Errorf("unknown connection type %q", req.Kind)
}

func serialMode(req StreamRequest) (*serial.Mode, error) {
	m := &serial.Mode{BaudRate: req.Baud, DataBits: req.DataBits}
	if m.BaudRate == 0 {
		m.BaudRate = 9600
	}
	if m.BaudRate < 50 || m.BaudRate > 4_000_000 {
		return nil, errors.New("invalid baud rate")
	}
	if m.DataBits == 0 {
		m.DataBits = 8
	}
	if m.DataBits < 5 || m.DataBits > 8 {
		return nil, errors.New("data bits must be 5 to 8")
	}
	switch req.Parity {
	case "", "none":
		m.Parity = serial.NoParity
	case "even":
		m.Parity = serial.EvenParity
	case "odd":
		m.Parity = serial.OddParity
	case "mark":
		m.Parity = serial.MarkParity
	case "space":
		m.Parity = serial.SpaceParity
	default:
		return nil, fmt.Errorf("unknown parity %q", req.Parity)
	}
	switch req.StopBits {
	case "", "1":
		m.StopBits = serial.OneStopBit
	case "1.5":
		m.StopBits = serial.OnePointFiveStopBits
	case "2":
		m.StopBits = serial.TwoStopBits
	default:
		return nil, fmt.Errorf("unknown stop bits %q", req.StopBits)
	}
	return m, nil
}

// start begins forwarding output. The UI calls it after subscribing, so
// nothing sent before that (a login banner) is lost; later calls are no-ops.
func (s *streamConn) start() {
	s.startOnce.Do(func() {
		go func() {
			streamUTF8(s.rw, s.pipe.emit)
			s.pipe.flush()
			close(s.done)
			s.pipe.send("terminal:closed:" + s.id)
			if s.onClosed != nil {
				s.onClosed()
			}
		}()
	})
}

func (s *streamConn) write(data []byte) error {
	s.wmu.Lock()
	defer s.wmu.Unlock()
	_, err := s.rw.Write(data)
	return err
}

func (s *streamConn) resize(cols, rows int) {
	if s.telnet != nil {
		s.telnet.Resize(cols, rows)
	}
	if r := s.rec.Load(); r != nil {
		r.Resize(cols, rows)
	}
}

func (s *streamConn) close() {
	s.closeOnce.Do(func() {
		if r := s.rec.Swap(nil); r != nil {
			r.Close()
		}
		_ = s.rw.Close()
	})
}

// --- ConnectionManager ---

// ConnectStream opens a Telnet or serial session.
func (m *ConnectionManager) ConnectStream(req StreamRequest) error {
	if req.ID == "" {
		return errors.New("connection id is required")
	}
	m.emitter.Emit("connection:state:"+req.ID, "connecting")
	rw, tn, err := openStream(req)
	if err != nil {
		m.emitter.Emit("connection:state:"+req.ID, "disconnected")
		return err
	}
	s := &streamConn{id: req.ID, kind: req.Kind, rw: rw, telnet: tn, emitter: m.emitter, done: make(chan struct{})}
	s.pipe = newOutputPipe(m.emitter, req.ID, ptyOptions{gate: m.gate, mask: m.maskOptions, recorder: s.rec.Load})
	s.onClosed = func() { m.handleStreamClosed(req.ID, s) }

	m.mu.Lock()
	old := m.streams[req.ID]
	oldConn := m.connections[req.ID]
	delete(m.connections, req.ID)
	m.streams[req.ID] = s
	m.mu.Unlock()
	if old != nil {
		old.close()
	}
	if oldConn != nil {
		_ = oldConn.Close()
	}
	m.emitter.Emit("connection:state:"+req.ID, "connected")
	return nil
}

func (m *ConnectionManager) stream(id string) *streamConn {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.streams[id]
}

func (m *ConnectionManager) handleStreamClosed(id string, s *streamConn) {
	m.mu.Lock()
	current := m.streams[id] == s
	if current {
		delete(m.streams, id)
	}
	m.mu.Unlock()
	s.close()
	if current {
		m.emitter.Emit("connection:state:"+id, "disconnected")
	}
}

// SerialPorts lists the serial devices on this machine.
func (m *ConnectionManager) SerialPorts() ([]string, error) { return ListSerialPorts() }
