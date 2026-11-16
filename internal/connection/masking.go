package connection

import (
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// Output masking ("presentation mode") redacts secrets in the PTY stream
// before it reaches xterm.js. It only rewrites printable text: escape
// sequences pass through untouched, and every masked character becomes one
// "•", so the text keeps its width and TUIs (vim, htop) keep their layout.
//
// Chunks can split a secret anywhere. The masker remembers the current line
// (already emitted, unmasked) as context, so a value that arrives after its
// key ("TOKEN=" then "abc") is still recognised; the part of a match that was
// already emitted can't be taken back, which is why keys are never masked,
// only values. Self-identifying tokens (JWTs, AWS key IDs, IPs) have no key in
// front of them, so a word at the very end of a chunk that could be the start
// of one is held back briefly (holdDelay) until the rest arrives.

const (
	maskRune      = '•'
	maxLineCtx    = 1024
	maxHeld       = 512
	holdDelay     = 25 * time.Millisecond
	maxEscapeHeld = 4096
)

// MaskOptions selects what to redact.
type MaskOptions struct {
	Enabled bool
	IPs     bool
}

type maskRule struct {
	re *regexp.Regexp
	// group is the submatch to mask (0 = whole match).
	group int
	// keep lists bytes inside the masked range to leave as they are
	// (e.g. the dots of an IP address).
	keep string
}

var (
	secretRules = []maskRule{
		// KEY=value / KEY: value / "key": "value" for anything that looks like a credential.
		{re: regexp.MustCompile(`(?i)\b[a-z0-9_.-]*(?:password|passwd|passphrase|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|credentials?)[a-z0-9_.-]*["']?[ \t]*[=:][ \t]*("[^"\r\n]*"?|'[^'\r\n]*'?|[^\s'"]+)`), group: 1},
		// Authorization headers.
		{re: regexp.MustCompile(`(?i)\b(?:authorization|proxy-authorization)[ \t]*:[ \t]*(?:bearer|basic|token|digest)?[ \t]*([^\s]+)`), group: 1},
		{re: regexp.MustCompile(`(?i)\bbearer[ \t]+([A-Za-z0-9\-._~+/]{8,}=*)`), group: 1},
		// Self-identifying tokens.
		{re: regexp.MustCompile(`\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*`)},       // JWT
		{re: regexp.MustCompile(`\b(?:AKIA|ASIA)[0-9A-Z]{16}\b`)},                                   // AWS access key ID
		{re: regexp.MustCompile(`\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b`)}, // GitHub
		{re: regexp.MustCompile(`\bglpat-[A-Za-z0-9_-]{20,}\b`)},                                    // GitLab
		{re: regexp.MustCompile(`\bxox[abprs]-[A-Za-z0-9-]{10,}\b`)},                                // Slack
		{re: regexp.MustCompile(`\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b`)},                        // OpenAI / Anthropic style
		// URLs with inline credentials: scheme://user:password@host
		{re: regexp.MustCompile(`\b[a-z][a-z0-9+.-]*://[^\s:/@]+:([^\s@/]+)@`), group: 1},
	}
	ipRules = []maskRule{
		{re: regexp.MustCompile(`\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b`), keep: "."},
		{re: regexp.MustCompile(`(?i)(?:\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b|(?:\b(?:[0-9a-f]{1,4}:){1,6}|::?)(?::[0-9a-f]{1,4}){1,6}\b|\b(?:[0-9a-f]{1,4}:){1,7}:)`), keep: ":"},
	}

	keyBegin = regexp.MustCompile(`-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----`)
	keyEnd   = regexp.MustCompile(`-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----`)

	// Prefixes of self-identifying tokens; a trailing word that could still
	// grow into one is held back.
	tokenPrefixes = []string{"eyJ", "AKIA", "ASIA", "ghp_", "gho_", "ghu_", "ghs_", "ghr_", "github_pat_", "glpat-", "xoxa-", "xoxb-", "xoxp-", "xoxr-", "xoxs-", "sk-"}
)

// OutputMasker is a stateful, chunk-at-a-time filter for one terminal stream.
type OutputMasker struct {
	mu      sync.Mutex
	opts    func() MaskOptions
	emit    func(string)
	lineCtx string // raw text of the current line already emitted
	inKey   bool   // inside a -----BEGIN ... PRIVATE KEY----- block
	held    string // raw input not emitted yet (a partial escape or token)
	timer   *time.Timer
}

// NewOutputMasker wraps emit. opts is read for every chunk, so masking can be
// switched on and off while the session runs.
func NewOutputMasker(opts func() MaskOptions, emit func(string)) *OutputMasker {
	return &OutputMasker{opts: opts, emit: emit}
}

// Write filters one chunk (whole UTF-8 characters) and emits the result.
func (m *OutputMasker) Write(chunk string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.stopTimer()
	o := m.opts()
	if !o.Enabled {
		data := m.held + chunk
		m.reset()
		if data != "" {
			m.emit(data)
		}
		return
	}
	out, hold := m.process(m.held+chunk, o, false)
	m.held = hold
	if out != "" {
		m.emit(out)
	}
	if m.held != "" {
		m.timer = time.AfterFunc(holdDelay, m.flushHeld)
	}
}

// Flush emits anything held back (end of stream).
func (m *OutputMasker) Flush() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.stopTimer()
	m.flushLocked()
}

func (m *OutputMasker) flushHeld() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.timer = nil
	m.flushLocked()
}

func (m *OutputMasker) flushLocked() {
	if m.held == "" {
		return
	}
	data := m.held
	m.held = ""
	o := m.opts()
	if !o.Enabled {
		m.emit(data)
		return
	}
	out, _ := m.process(data, o, true)
	if out != "" {
		m.emit(out)
	}
}

func (m *OutputMasker) stopTimer() {
	if m.timer != nil {
		m.timer.Stop()
		m.timer = nil
	}
}

func (m *OutputMasker) reset() {
	m.held = ""
	m.lineCtx = ""
	m.inKey = false
}

// process masks data. Unless final, it returns a trailing part to hold back:
// an unfinished escape sequence or a word that may be the start of a token.
func (m *OutputMasker) process(data string, o MaskOptions, final bool) (out, hold string) {
	var b strings.Builder
	b.Grow(len(data) + 16)
	i := 0
	for i < len(data) {
		if data[i] == 0x1b {
			n, complete := escapeLen(data[i:])
			if !complete {
				if final || len(data)-i > maxEscapeHeld {
					b.WriteString(data[i:])
					return b.String(), ""
				}
				return b.String(), data[i:]
			}
			b.WriteString(m.maskEscape(data[i:i+n], o))
			i += n
			continue
		}
		j := strings.IndexByte(data[i:], 0x1b)
		if j < 0 {
			j = len(data)
		} else {
			j += i
		}
		text := data[i:j]
		if !final && j == len(data) {
			k := heldTail(text, o)
			if k == 0 && (m.inKey || keyBegin.MatchString(text)) {
				// Inside a key block, a line that starts with "-" may be the
				// END marker arriving in pieces: wait for the whole marker so
				// it isn't masked.
				tail := text[strings.LastIndexByte(text, '\n')+1:]
				if strings.HasPrefix(tail, "-") && !keyEnd.MatchString(tail) && !keyBegin.MatchString(tail) && len(tail) < 64 {
					k = len(tail)
				}
			}
			if k > 0 {
				b.WriteString(m.maskText(text[:len(text)-k], o))
				return b.String(), text[len(text)-k:]
			}
		}
		b.WriteString(m.maskText(text, o))
		i = j
	}
	return b.String(), ""
}

// maskText masks a run of plain text (no escape sequences), line by line.
func (m *OutputMasker) maskText(text string, o MaskOptions) string {
	if text == "" {
		return ""
	}
	var b strings.Builder
	b.Grow(len(text) + 8)
	for {
		nl := strings.IndexByte(text, '\n')
		seg := text
		if nl >= 0 {
			seg = text[:nl]
		}
		b.WriteString(m.maskSegment(seg, o))
		if nl < 0 {
			return b.String()
		}
		b.WriteByte('\n')
		m.lineCtx = ""
		text = text[nl+1:]
		if text == "" {
			return b.String()
		}
	}
}

// maskSegment masks text with no newline, using the rest of the line that
// was already emitted as context.
func (m *OutputMasker) maskSegment(seg string, o MaskOptions) string {
	if seg == "" {
		return ""
	}
	line := m.lineCtx + seg
	base := len(m.lineCtx)
	var ranges [][2]int
	add := func(s, e int, keep string) {
		if e <= base {
			return
		}
		if s < base {
			s = base
		}
		if keep == "" {
			ranges = append(ranges, [2]int{s, e})
			return
		}
		start := -1
		for k := s; k < e; k++ {
			if strings.IndexByte(keep, line[k]) >= 0 {
				if start >= 0 {
					ranges = append(ranges, [2]int{start, k})
					start = -1
				}
			} else if start < 0 {
				start = k
			}
		}
		if start >= 0 {
			ranges = append(ranges, [2]int{start, e})
		}
	}

	// Private key blocks: everything between BEGIN and END except the markers.
	pos := 0
	for pos < len(line) {
		if m.inKey {
			if loc := keyEnd.FindStringIndex(line[pos:]); loc != nil {
				add(pos, pos+loc[0], " \t\r")
				pos += loc[1]
				m.inKey = false
				continue
			}
			add(pos, len(line), " \t\r")
			break
		}
		loc := keyBegin.FindStringIndex(line[pos:])
		if loc == nil {
			break
		}
		pos += loc[1]
		m.inKey = true
	}

	rules := secretRules
	if o.IPs {
		rules = append(append([]maskRule{}, secretRules...), ipRules...)
	}
	for _, r := range rules {
		for _, mt := range r.re.FindAllStringSubmatchIndex(line, -1) {
			s, e := mt[2*r.group], mt[2*r.group+1]
			if s < 0 || e <= s {
				continue
			}
			add(s, e, r.keep)
		}
	}

	m.lineCtx = line
	if len(m.lineCtx) > maxLineCtx {
		// Keep whole characters at the cut.
		cut := len(m.lineCtx) - maxLineCtx
		for cut < len(m.lineCtx) && !utf8.RuneStart(m.lineCtx[cut]) {
			cut++
		}
		m.lineCtx = m.lineCtx[cut:]
	}
	if len(ranges) == 0 {
		return seg
	}
	return applyMask(line, base, ranges)
}

// applyMask returns line[base:] with every rune inside ranges replaced by
// maskRune. Control characters are kept so cursor movement still works.
func applyMask(line string, base int, ranges [][2]int) string {
	masked := make([]bool, len(line))
	for _, r := range ranges {
		for k := r[0]; k < r[1]; k++ {
			masked[k] = true
		}
	}
	var b strings.Builder
	b.Grow(len(line) - base + 16)
	for k := base; k < len(line); {
		r, size := utf8.DecodeRuneInString(line[k:])
		if masked[k] && r >= 0x20 && r != 0x7f {
			b.WriteRune(maskRune)
		} else {
			b.WriteString(line[k : k+size])
		}
		k += size
	}
	return b.String()
}

// maskEscape masks the payload of window-title OSC sequences (which often
// contain user@host); other sequences are returned unchanged.
func (m *OutputMasker) maskEscape(seq string, o MaskOptions) string {
	if len(seq) < 5 || seq[1] != ']' {
		return seq
	}
	if !(strings.HasPrefix(seq[2:], "0;") || strings.HasPrefix(seq[2:], "1;") || strings.HasPrefix(seq[2:], "2;")) {
		return seq
	}
	end := len(seq) - 1 // BEL
	if strings.HasSuffix(seq, "\x1b\\") {
		end = len(seq) - 2
	}
	tmp := OutputMasker{}
	return seq[:4] + tmp.maskSegment(seq[4:end], o) + seq[end:]
}

// escapeLen returns the length of the escape sequence at the start of s and
// whether it is complete.
func escapeLen(s string) (int, bool) {
	if len(s) < 2 {
		return len(s), false
	}
	switch s[1] {
	case '[': // CSI: parameters, then a final byte 0x40–0x7E
		for k := 2; k < len(s); k++ {
			if c := s[k]; c >= 0x40 && c <= 0x7e {
				return k + 1, true
			}
		}
		return len(s), false
	case ']', 'P', 'X', '^', '_': // OSC / DCS / SOS / PM / APC: until BEL or ST
		for k := 2; k < len(s); k++ {
			if s[k] == 0x07 && s[1] == ']' {
				return k + 1, true
			}
			if s[k] == 0x1b {
				if k+1 >= len(s) {
					return len(s), false
				}
				if s[k+1] == '\\' {
					return k + 2, true
				}
			}
		}
		return len(s), false
	default:
		// ESC + intermediates (0x20–0x2F) + final byte.
		for k := 1; k < len(s); k++ {
			if c := s[k]; c < 0x20 || c > 0x2f {
				return k + 1, true
			}
		}
		return len(s), false
	}
}

// heldTail returns how many trailing bytes of text to hold back because they
// may be the beginning of a token that is still arriving.
func heldTail(text string, o MaskOptions) int {
	k := len(text)
	for k > 0 && isTokenByte(text[k-1]) {
		k--
	}
	word := text[k:]
	if word == "" || len(word) > maxHeld {
		return 0
	}
	for _, p := range tokenPrefixes {
		if strings.HasPrefix(word, p) || strings.HasPrefix(p, word) {
			return len(word)
		}
	}
	if o.IPs && strings.Trim(word, "0123456789abcdefABCDEF.:") == "" && strings.ContainsAny(word, "0123456789") {
		return len(word)
	}
	return 0
}

func isTokenByte(c byte) bool {
	return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_' || c == '-' || c == '.' || c == ':'
}

// LooksSensitive reports whether text contains anything the masker would
// redact (used to decide whether to auto-clear a copied selection).
func LooksSensitive(text string) bool {
	if keyBegin.MatchString(text) {
		return true
	}
	for _, r := range secretRules {
		if r.re.MatchString(text) {
			return true
		}
	}
	return false
}
