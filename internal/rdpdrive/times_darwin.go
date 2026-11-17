//go:build darwin

package rdpdrive

import (
	"io/fs"
	"syscall"
	"time"
)

func statTimes(fi fs.FileInfo) (created, accessed time.Time) {
	if st, ok := fi.Sys().(*syscall.Stat_t); ok {
		return time.Unix(st.Birthtimespec.Unix()), time.Unix(st.Atimespec.Unix())
	}
	return time.Time{}, time.Time{}
}
