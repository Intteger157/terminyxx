//go:build !windows

package connection

import "io"

// Pageant exists only on Windows.
func dialPageant() io.ReadWriteCloser { return nil }
