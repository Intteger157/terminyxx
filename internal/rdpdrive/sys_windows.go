//go:build windows

package rdpdrive

import (
	"errors"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

func fileTimesAll(fi fs.FileInfo) (created, accessed, written time.Time) {
	if d, ok := fi.Sys().(*syscall.Win32FileAttributeData); ok {
		return time.Unix(0, d.CreationTime.Nanoseconds()),
			time.Unix(0, d.LastAccessTime.Nanoseconds()),
			time.Unix(0, d.LastWriteTime.Nanoseconds())
	}
	t := fi.ModTime()
	return t, t, t
}

const attrReparsePoint = 0x00000400

func attributes(fi fs.FileInfo, _ string) uint32 {
	if d, ok := fi.Sys().(*syscall.Win32FileAttributeData); ok {
		// Links are followed, so the entry is reported as its target.
		return d.FileAttributes &^ attrReparsePoint
	}
	var a uint32
	if fi.Mode().Perm()&0o200 == 0 {
		a |= attrReadOnly
	}
	return a
}

func diskSpace(path string) (total, free uint64, err error) {
	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return 0, 0, err
	}
	var avail uint64
	err = windows.GetDiskFreeSpaceEx(p, &avail, &total, &free)
	return total, avail, err
}

func statusOf(err error) uint32 {
	var errno syscall.Errno
	if errors.As(err, &errno) {
		switch errno {
		case windows.ERROR_FILE_NOT_FOUND:
			return StatusNoSuchFile
		case windows.ERROR_PATH_NOT_FOUND:
			return StatusObjectPathNotFound
		case windows.ERROR_ACCESS_DENIED:
			return StatusAccessDenied
		case windows.ERROR_SHARING_VIOLATION, windows.ERROR_LOCK_VIOLATION:
			return StatusSharingViolation
		case windows.ERROR_DISK_FULL, windows.ERROR_HANDLE_DISK_FULL:
			return StatusDiskFull
		case windows.ERROR_DIR_NOT_EMPTY:
			return StatusDirectoryNotEmpty
		case windows.ERROR_WRITE_PROTECT:
			return StatusMediaWriteProtected
		case windows.ERROR_INVALID_NAME:
			return StatusObjectNameInvalid
		case windows.ERROR_ALREADY_EXISTS, windows.ERROR_FILE_EXISTS:
			return StatusObjectNameCollision
		case windows.ERROR_DIRECTORY:
			return StatusNotADirectory
		}
	}
	return commonStatus(err)
}

// localDrives lists the fixed and removable drives, for "share all drives".
func localDrives() []Drive {
	mask, err := windows.GetLogicalDrives()
	if err != nil {
		return nil
	}
	var out []Drive
	for i := 0; i < 26; i++ {
		if mask&(1<<i) == 0 {
			continue
		}
		letter := string(rune('A' + i))
		root := letter + `:\`
		p, _ := windows.UTF16PtrFromString(root)
		switch windows.GetDriveType(p) {
		case windows.DRIVE_FIXED, windows.DRIVE_REMOVABLE, windows.DRIVE_CDROM, windows.DRIVE_REMOTE:
		default:
			continue
		}
		if _, err := os.Stat(root); err != nil {
			continue // no media
		}
		out = append(out, Drive{Name: letter, Path: root})
	}
	return out
}

// driveName names a shared folder: its base name, or the letter of a drive root.
func driveName(path string) string {
	p := strings.TrimRight(path, `\/`)
	if len(p) == 2 && p[1] == ':' {
		return strings.ToUpper(p[:1])
	}
	if i := strings.LastIndexAny(p, `\/`); i >= 0 {
		return p[i+1:]
	}
	return p
}

// statName returns the metadata of rel without opening the file for reading.
// os.Root.Stat opens it with read access, which makes an antivirus scan an
// executable on every open (seconds for a large installer) while Explorer
// only wants its size and times. The parent folder is resolved through
// os.Root, so it is inside the drive, and the name is then queried by path
// like FindFirstFile does; a name that is itself a link is resolved through
// os.Root again.
func statName(d *drive, rel string) (fs.FileInfo, error) {
	if rel == "." {
		return d.root.Stat(rel)
	}
	if parent := path.Dir(rel); parent != "." {
		fi, err := d.root.Stat(parent)
		if err != nil {
			return nil, err
		}
		if !fi.IsDir() {
			return nil, &fs.PathError{Op: "stat", Path: rel, Err: syscall.ERROR_PATH_NOT_FOUND}
		}
	}
	abs := filepath.Join(d.Path, filepath.FromSlash(rel))
	if len(abs) >= 248 && !strings.HasPrefix(abs, `\\`) {
		abs = `\\?\` + abs
	}
	p, err := syscall.UTF16PtrFromString(abs)
	if err != nil {
		return nil, &fs.PathError{Op: "stat", Path: rel, Err: err}
	}
	var data syscall.Win32FileAttributeData
	if err := syscall.GetFileAttributesEx(p, syscall.GetFileExInfoStandard, (*byte)(unsafe.Pointer(&data))); err != nil {
		return nil, &fs.PathError{Op: "stat", Path: rel, Err: err}
	}
	if data.FileAttributes&attrReparsePoint != 0 {
		return d.root.Stat(rel)
	}
	return &nameStat{name: path.Base(rel), data: data}, nil
}

// nameStat is an fs.FileInfo from GetFileAttributesEx.
type nameStat struct {
	name string
	data syscall.Win32FileAttributeData
}

func (s *nameStat) Name() string { return s.name }
func (s *nameStat) Size() int64 {
	return int64(s.data.FileSizeHigh)<<32 | int64(s.data.FileSizeLow)
}
func (s *nameStat) IsDir() bool { return s.data.FileAttributes&syscall.FILE_ATTRIBUTE_DIRECTORY != 0 }
func (s *nameStat) Mode() fs.FileMode {
	m := fs.FileMode(0o666)
	if s.IsDir() {
		m = fs.ModeDir | 0o777
	}
	if s.data.FileAttributes&syscall.FILE_ATTRIBUTE_READONLY != 0 {
		m &^= 0o222
	}
	return m
}
func (s *nameStat) ModTime() time.Time { return time.Unix(0, s.data.LastWriteTime.Nanoseconds()) }
func (s *nameStat) Sys() any           { return &s.data }
