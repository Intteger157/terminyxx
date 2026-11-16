// Package capture hides the app window from screen capture and screen sharing
// (Zoom, Teams, Meet, OBS, screenshots), so terminal contents don't leak during
// a call. The window still looks normal to the user.
package capture

import "errors"

// ErrUnsupported is returned on platforms without a window-capture exclusion API.
var ErrUnsupported = errors.New("hiding the window from screen capture is not supported on this system")

// SetProtected excludes the app's windows from screen capture (true) or allows
// capture again (false).
func SetProtected(on bool) error {
	return setProtected(on)
}
