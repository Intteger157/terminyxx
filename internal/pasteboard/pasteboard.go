// Package pasteboard reads and writes the macOS clipboard natively for the
// built-in RDP client. WKWebView asks the user with a "Paste" menu on every
// navigator.clipboard.read(), so the web client can't watch the clipboard
// there; this package does it instead. Other systems return ErrUnsupported
// (WebView2's clipboard API works without prompts).
package pasteboard

import "errors"

// ErrUnsupported is returned on systems this package doesn't handle.
var ErrUnsupported = errors.New("native clipboard is only used on macOS")

// Content is what the RDP clipboard carries: plain text, HTML and a PNG image
// (base64, as Wails passes strings). Empty fields are absent.
type Content struct {
	Text string `json:"text,omitempty"`
	HTML string `json:"html,omitempty"`
	PNG  string `json:"png,omitempty"`
}

// MaxImage caps an image taken from the clipboard (encoded PNG bytes).
const MaxImage = 64 << 20

// Changed reports the clipboard content if it changed since the previous call
// to Changed or Write, and nil otherwise. The first call reports the current
// content.
func Changed() (*Content, error) { return changed() }

// Write replaces the clipboard content. A later Changed doesn't report it.
func Write(c Content) error { return write(c) }
