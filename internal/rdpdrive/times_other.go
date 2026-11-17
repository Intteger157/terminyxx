//go:build !windows && !darwin

package rdpdrive

import (
	"io/fs"
	"time"
)

// statTimes has no portable source outside Windows and macOS; the
// modification time stands in.
func statTimes(fs.FileInfo) (created, accessed time.Time) {
	return time.Time{}, time.Time{}
}
