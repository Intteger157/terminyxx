//go:build !windows

package rdpdrive

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"golang.org/x/sys/unix"
)

func fileTimesAll(fi fs.FileInfo) (created, accessed, written time.Time) {
	written = fi.ModTime()
	created, accessed = statTimes(fi)
	if created.IsZero() {
		created = written
	}
	if accessed.IsZero() {
		accessed = written
	}
	return created, accessed, written
}

func attributes(fi fs.FileInfo, name string) uint32 {
	var a uint32
	if fi.Mode().Perm()&0o200 == 0 && !fi.IsDir() {
		a |= attrReadOnly
	}
	if len(name) > 1 && strings.HasPrefix(name, ".") && name != ".." {
		a |= attrHidden
	}
	return a
}

func diskSpace(path string) (total, free uint64, err error) {
	var st unix.Statfs_t
	if err := unix.Statfs(path, &st); err != nil {
		return 0, 0, err
	}
	bsize := uint64(st.Bsize)
	return uint64(st.Blocks) * bsize, uint64(st.Bavail) * bsize, nil
}

func statusOf(err error) uint32 {
	var errno syscall.Errno
	if errors.As(err, &errno) {
		switch errno {
		case syscall.ENOENT:
			return StatusNoSuchFile
		case syscall.ENOTDIR:
			return StatusObjectPathNotFound
		case syscall.EACCES, syscall.EPERM:
			return StatusAccessDenied
		case syscall.ENOSPC, syscall.EDQUOT:
			return StatusDiskFull
		case syscall.ENOTEMPTY:
			return StatusDirectoryNotEmpty
		case syscall.EROFS:
			return StatusMediaWriteProtected
		case syscall.EEXIST:
			return StatusObjectNameCollision
		case syscall.EISDIR:
			return StatusFileIsADirectory
		case syscall.ENAMETOOLONG, syscall.EILSEQ:
			return StatusObjectNameInvalid
		}
	}
	return commonStatus(err)
}

// localDrives lists the mounted volumes, for "share all drives".
func localDrives() []Drive {
	var out []Drive
	if entries, err := os.ReadDir("/Volumes"); err == nil {
		for _, e := range entries {
			p := filepath.Join("/Volumes", e.Name())
			if fi, err := os.Stat(p); err == nil && fi.IsDir() {
				out = append(out, Drive{Name: e.Name(), Path: p})
			}
		}
	}
	if len(out) == 0 {
		if home, err := os.UserHomeDir(); err == nil {
			out = append(out, Drive{Name: "Home", Path: home})
		}
	}
	return out
}

func driveName(path string) string {
	name := filepath.Base(filepath.Clean(path))
	if name == "/" || name == "." {
		return "Root"
	}
	return name
}

// statName returns the metadata of rel.
func statName(d *drive, rel string) (fs.FileInfo, error) {
	return d.root.Stat(rel)
}
