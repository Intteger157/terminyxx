// Package dragout starts an operating-system drag of files that only exist on
// a remote server. The files are virtual: Explorer asks for their contents
// when the user drops, and they are streamed from the server at that moment,
// so nothing is downloaded up front.
package dragout

import (
	"errors"
	"io"
	"time"
)

// ErrUnsupported is returned on platforms without an implementation.
var ErrUnsupported = errors.New("dragging files out of the app is not supported on this system yet")

// Item is one file or folder in the drag. Name is its path below the drop
// folder with '\' separators (a folder comes before what it contains).
type Item struct {
	Name    string
	IsDir   bool
	Size    int64
	ModTime time.Time
}

// OpenFunc opens the contents of the file at index i of the items.
type OpenFunc func(i int) (io.ReadCloser, error)
