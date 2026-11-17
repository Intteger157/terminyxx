package connection

import "sync"

// outputPipe carries terminal output from a session to the UI: recording,
// secret masking and the lock gate, in that order. SSH shells and the raw
// Telnet/serial streams share it so they behave the same.
type outputPipe struct {
	// send emits an event through the lock gate: output produced while the
	// app is locked is queued (in order) instead of reaching the webview.
	send   func(event string, payload ...interface{})
	emit   func(string)
	masker *OutputMasker
}

func newOutputPipe(emitter EventEmitter, connID string, opts ptyOptions) *outputPipe {
	p := &outputPipe{}
	p.send = func(event string, payload ...interface{}) {
		if opts.gate == nil {
			emitter.Emit(event, payload...)
			return
		}
		size := 0
		if len(payload) > 0 {
			if s, ok := payload[0].(string); ok {
				size = len(s)
			}
		}
		opts.gate.Send(connID, size, func() { emitter.Emit(event, payload...) })
	}

	var emitMu sync.Mutex
	raw := func(s string) {
		// Record what the terminal shows (after masking), not what the server sent.
		if opts.recorder != nil {
			if r := opts.recorder(); r != nil {
				r.Output(s)
			}
		}
		p.send("terminal:output:"+connID, s)
	}
	if opts.mask != nil {
		p.masker = NewOutputMasker(opts.mask, raw)
	}
	p.emit = func(s string) {
		if p.masker != nil {
			p.masker.Write(s) // serialized by the masker's own lock
			return
		}
		emitMu.Lock()
		raw(s)
		emitMu.Unlock()
	}
	return p
}

// flush releases text the masker was holding back.
func (p *outputPipe) flush() {
	if p.masker != nil {
		p.masker.Flush()
	}
}
