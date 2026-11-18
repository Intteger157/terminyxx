package main

import "terminyxx/internal/pasteboard"

// The built-in RDP client's clipboard on macOS, where the webview can't read
// the clipboard without asking every time (see internal/pasteboard). The
// component polls RDPClipboardChanged while a session with the clipboard on
// has the focus, and writes what the server copied with RDPClipboardWrite.

// RDPClipboardChanged returns the clipboard content if it changed since the
// last call (or write), otherwise nil.
func (a *App) RDPClipboardChanged() (*pasteboard.Content, error) {
	if err := a.guard(); err != nil {
		return nil, err
	}
	return pasteboard.Changed()
}

// RDPClipboardWrite puts what the remote desktop copied on the clipboard.
func (a *App) RDPClipboardWrite(c pasteboard.Content) error {
	if err := a.guard(); err != nil {
		return err
	}
	return pasteboard.Write(c)
}
