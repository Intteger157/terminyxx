// Package rdpdrive serves local folders to a remote desktop as redirected
// drives (RDPDR). The built-in RDP client runs in the webview and cannot open
// files, so it forwards each filesystem request of the server here as a
// Request and sends back the Reply.
//
// Each drive is an os.Root, so no request can reach outside the shared folder,
// symbolic links included. Paths come from the server and are checked again
// here. File handles open the OS file only when data is read or written, and
// close it before a rename or delete, because Windows refuses to rename or
// delete a file that is open.
package rdpdrive

import (
	"errors"
	"io"
	"io/fs"
	"os"
	"path"
	"sort"
	"strings"
	"sync"
	"time"
)

// NTSTATUS values sent to the server.
const (
	StatusSuccess             uint32 = 0x00000000
	StatusUnsuccessful        uint32 = 0xC0000001
	StatusInvalidHandle       uint32 = 0xC0000008
	StatusInvalidParameter    uint32 = 0xC000000D
	StatusNoSuchFile          uint32 = 0xC000000F
	StatusAccessDenied        uint32 = 0xC0000022
	StatusObjectNameInvalid   uint32 = 0xC0000033
	StatusObjectNameCollision uint32 = 0xC0000035
	StatusObjectPathNotFound  uint32 = 0xC000003A
	StatusSharingViolation    uint32 = 0xC0000043
	StatusDiskFull            uint32 = 0xC000007F
	StatusInsufficientRes     uint32 = 0xC000009A
	StatusMediaWriteProtected uint32 = 0xC00000A2
	StatusFileIsADirectory    uint32 = 0xC00000BA
	StatusNotSupported        uint32 = 0xC00000BB
	StatusDirectoryNotEmpty   uint32 = 0xC0000101
	StatusNotADirectory       uint32 = 0xC0000103
)

// Create dispositions ([MS-SMB2] 2.2.13).
const (
	fileSupersede   = 0
	fileOpen        = 1
	fileCreate      = 2
	fileOpenIf      = 3
	fileOverwrite   = 4
	fileOverwriteIf = 5
)

// Create results (DR_CREATE_RSP Information).
const (
	infoSuperseded  = 0
	infoOpened      = 1
	infoCreated     = 2
	infoOverwritten = 3
)

// Create options and access rights used here.
const (
	optDirectoryFile    = 0x00000001
	optNonDirectoryFile = 0x00000040
	optDeleteOnClose    = 0x00001000

	accessWriteData      = 0x00000002
	accessAppendData     = 0x00000004
	accessWriteEA        = 0x00000010
	accessWriteAttrs     = 0x00000100
	accessDelete         = 0x00010000
	accessMaximumAllowed = 0x02000000
	accessGenericAll     = 0x10000000
	accessGenericWrite   = 0x40000000

	attrReadOnly = 0x00000001
	attrHidden   = 0x00000002
	attrSystem   = 0x00000004
	attrArchive  = 0x00000020
)

const (
	// MaxHandles is how many files the server may hold open on one session.
	MaxHandles = 4096
	// MaxRead is the largest read answered.
	MaxRead = 16 << 20
	// MaxListing is the most entries returned for one directory query.
	MaxListing = 100_000
)

// Drive is a local folder shared with the remote desktop.
type Drive struct {
	ID       uint32 `json:"deviceId"`
	Name     string `json:"name"`
	Path     string `json:"-"`
	ReadOnly bool   `json:"-"`
}

// Request is a filesystem request from the server, as the webview forwards it.
type Request struct {
	ID       uint32 `json:"id"`
	Op       string `json:"op"`
	DeviceID uint32 `json:"deviceId"`
	FileID   uint32 `json:"fileId"`

	Path          string `json:"path,omitempty"`
	DesiredAccess uint32 `json:"desiredAccess,omitempty"`
	Disposition   uint32 `json:"disposition,omitempty"`
	Options       uint32 `json:"options,omitempty"`
	Attributes    uint32 `json:"attributes,omitempty"`

	Offset float64 `json:"offset,omitempty"`
	Length uint32  `json:"length,omitempty"`
	Data   []byte  `json:"data,omitempty"`

	Created  float64 `json:"created,omitempty"`
	Accessed float64 `json:"accessed,omitempty"`
	Written  float64 `json:"written,omitempty"`
	Changed  float64 `json:"changed,omitempty"`

	Size    float64 `json:"size,omitempty"`
	Delete  bool    `json:"delete,omitempty"`
	To      string  `json:"to,omitempty"`
	Replace bool    `json:"replace,omitempty"`
}

// FileInfo describes a file or directory. Times are Unix milliseconds.
type FileInfo struct {
	Name          string  `json:"name,omitempty"`
	Dir           bool    `json:"dir"`
	Size          int64   `json:"size"`
	Created       float64 `json:"created"`
	Accessed      float64 `json:"accessed"`
	Written       float64 `json:"written"`
	Changed       float64 `json:"changed"`
	Attributes    uint32  `json:"attributes"`
	DeletePending bool    `json:"deletePending,omitempty"`
}

// Reply answers a Request.
type Reply struct {
	ID          uint32     `json:"id"`
	Status      uint32     `json:"status"`
	FileID      uint32     `json:"fileId,omitempty"`
	Information uint32     `json:"information,omitempty"`
	Data        []byte     `json:"data,omitempty"`
	Length      uint32     `json:"length,omitempty"`
	Stat        *FileInfo  `json:"stat,omitempty"`
	Entries     []FileInfo `json:"entries,omitempty"`
	Total       float64    `json:"total,omitempty"`
	Free        float64    `json:"free,omitempty"`
}

type drive struct {
	Drive
	root *os.Root
}

type handle struct {
	drive *drive
	// rel is the path below the drive root, "/"-separated; "." is the root.
	rel           string
	dir           bool
	writable      bool
	mayDelete     bool
	deleteOnClose bool
	file          *os.File
}

// Session is the set of drives and open files of one RDP session.
type Session struct {
	mu      sync.RWMutex
	drives  map[uint32]*drive
	handles map[uint32]*handle
	next    uint32
}

// NewSession opens the drives. A drive whose folder can't be opened is
// skipped and returned in failed.
func NewSession(drives []Drive) (s *Session, failed []Drive) {
	s = &Session{drives: map[uint32]*drive{}, handles: map[uint32]*handle{}, next: 1}
	for _, d := range drives {
		root, err := os.OpenRoot(d.Path)
		if err != nil {
			failed = append(failed, d)
			continue
		}
		s.drives[d.ID] = &drive{Drive: d, root: root}
	}
	return s, failed
}

// Drives returns the drives that were opened, by device ID.
func (s *Session) Drives() []Drive {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Drive, 0, len(s.drives))
	for _, d := range s.drives {
		out = append(out, d.Drive)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// Reset closes every open file (the server restarted the channel).
func (s *Session) Reset() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, h := range s.handles {
		h.closeFile()
		delete(s.handles, id)
	}
}

// Close closes every open file and drive.
func (s *Session) Close() {
	s.Reset()
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, d := range s.drives {
		_ = d.root.Close()
	}
	s.drives = map[uint32]*drive{}
}

// Do runs one request. It never fails: errors become an NTSTATUS.
//
// Requests may run concurrently, but the caller must not run two requests for
// the same handle at once (Serve queues them per handle). File I/O happens
// under the read lock, so a slow file doesn't hold up the others; only a
// rename, which moves other handles, and changes to the handle table take
// the write lock.
func (s *Session) Do(req Request) Reply {
	reply := Reply{ID: req.ID}
	switch req.Op {
	case "create":
		status, h, info := s.create(req)
		reply.Status, reply.Information = status, info
		if status != StatusSuccess {
			return reply
		}
		// The client answers the metadata queries that usually follow from this.
		reply.Stat, _ = h.stat()
		s.mu.Lock()
		id := s.next
		for s.handles[id] != nil || id == 0 {
			id++
		}
		s.next = id + 1
		s.handles[id] = h
		s.mu.Unlock()
		reply.FileID = id
		return reply
	case "rename":
		s.mu.Lock()
		defer s.mu.Unlock()
		h := s.handles[req.FileID]
		if h == nil || h.drive.ID != req.DeviceID {
			reply.Status = StatusInvalidHandle
		} else {
			reply.Status = s.rename(h, req.To, req.Replace)
		}
		return reply
	}

	s.mu.RLock()
	h := s.handles[req.FileID]
	if h == nil || h.drive.ID != req.DeviceID {
		s.mu.RUnlock()
		reply.Status = StatusInvalidHandle
		return reply
	}
	switch req.Op {
	case "close":
		h.close()
		s.mu.RUnlock()
		s.mu.Lock()
		delete(s.handles, req.FileID)
		s.mu.Unlock()
		return reply
	case "read":
		reply.Data, reply.Status = h.read(req.Offset, req.Length)
	case "write":
		var n int
		n, reply.Status = h.write(req.Offset, req.Data)
		reply.Length = uint32(n)
	case "stat":
		reply.Stat, reply.Status = h.stat()
	case "list":
		reply.Entries, reply.Status = h.list(req.Path)
	case "volume":
		total, free, err := diskSpace(h.drive.Path)
		if err != nil {
			reply.Status = statusOf(err)
		} else {
			reply.Total, reply.Free = float64(total), float64(free)
		}
	case "setBasic":
		reply.Status = h.setBasic(req)
	case "setSize":
		reply.Status = h.setSize(req.Size)
	case "setDelete":
		reply.Status = h.setDelete(req.Delete)
	default:
		reply.Status = StatusNotSupported
	}
	s.mu.RUnlock()
	return reply
}

func (s *Session) create(req Request) (status uint32, h *handle, info uint32) {
	s.mu.RLock()
	d := s.drives[req.DeviceID]
	full := len(s.handles) >= MaxHandles
	s.mu.RUnlock()
	if d == nil {
		return StatusNoSuchFile, nil, 0
	}
	if full {
		return StatusInsufficientRes, nil, 0
	}
	rel, err := parsePath(req.Path)
	if err != nil {
		return StatusObjectNameInvalid, nil, 0
	}
	writeAccess := req.DesiredAccess&(accessWriteData|accessAppendData|accessWriteEA|accessGenericWrite|accessGenericAll) != 0
	maxAllowed := req.DesiredAccess&accessMaximumAllowed != 0
	h = &handle{
		drive:         d,
		rel:           rel,
		writable:      !d.ReadOnly && (writeAccess || maxAllowed),
		mayDelete:     req.DesiredAccess&(accessDelete|accessGenericAll|accessMaximumAllowed) != 0,
		deleteOnClose: req.Options&optDeleteOnClose != 0,
	}
	if d.ReadOnly && (writeAccess || h.deleteOnClose) {
		return StatusMediaWriteProtected, nil, 0
	}

	fi, statErr := statName(d, rel)
	exists := statErr == nil
	if statErr != nil && !errors.Is(statErr, fs.ErrNotExist) {
		return statusOf(statErr), nil, 0
	}
	disp := req.Disposition
	switch {
	case disp > fileOverwriteIf:
		return StatusInvalidParameter, nil, 0
	case exists && disp == fileCreate:
		return StatusObjectNameCollision, nil, 0
	case !exists && (disp == fileOpen || disp == fileOverwrite):
		if _, err := d.root.Stat(path.Dir(rel)); err != nil {
			return StatusObjectPathNotFound, nil, 0
		}
		return StatusNoSuchFile, nil, 0
	}

	if exists {
		h.dir = fi.IsDir()
		if h.dir && req.Options&optNonDirectoryFile != 0 {
			return StatusFileIsADirectory, nil, 0
		}
		if !h.dir && req.Options&optDirectoryFile != 0 {
			return StatusNotADirectory, nil, 0
		}
		if h.dir && rel == "." && h.deleteOnClose {
			return StatusAccessDenied, nil, 0
		}
		info = infoOpened
		if disp == fileSupersede || disp == fileOverwrite || disp == fileOverwriteIf {
			if h.dir {
				return StatusFileIsADirectory, nil, 0
			}
			if d.ReadOnly {
				return StatusMediaWriteProtected, nil, 0
			}
			f, err := d.root.OpenFile(rel, os.O_RDWR|os.O_TRUNC, 0)
			if err != nil {
				return statusOf(err), nil, 0
			}
			h.file, h.writable = f, true
			info = infoOverwritten
			if disp == fileSupersede {
				info = infoSuperseded
			}
		}
	} else {
		if d.ReadOnly {
			return StatusMediaWriteProtected, nil, 0
		}
		if req.Options&optDirectoryFile != 0 {
			if err := d.root.Mkdir(rel, 0o777); err != nil {
				return statusOfCreate(d, rel, err), nil, 0
			}
			h.dir = true
		} else {
			f, err := d.root.OpenFile(rel, os.O_RDWR|os.O_CREATE|os.O_EXCL, 0o666)
			if err != nil {
				return statusOfCreate(d, rel, err), nil, 0
			}
			h.file, h.writable = f, true
			if req.Attributes&attrReadOnly != 0 {
				// Applied on close, so this handle can still write.
				defer func() { _ = d.root.Chmod(rel, 0o444) }()
			}
		}
		info = infoCreated
	}

	return StatusSuccess, h, info
}

// statusOfCreate tells a missing parent folder apart from other failures.
func statusOfCreate(d *drive, rel string, err error) uint32 {
	if errors.Is(err, fs.ErrNotExist) {
		return StatusObjectPathNotFound
	}
	if errors.Is(err, fs.ErrExist) {
		return StatusObjectNameCollision
	}
	return statusOf(err)
}

func (h *handle) open() (*os.File, uint32) {
	if h.dir {
		return nil, StatusFileIsADirectory
	}
	if h.file != nil {
		return h.file, StatusSuccess
	}
	flag := os.O_RDONLY
	if h.writable {
		flag = os.O_RDWR
	}
	f, err := h.drive.root.OpenFile(h.rel, flag, 0)
	if err != nil && h.writable && errors.Is(err, fs.ErrPermission) {
		// A MAXIMUM_ALLOWED open of a read-only file.
		f, err = h.drive.root.OpenFile(h.rel, os.O_RDONLY, 0)
		h.writable = false
	}
	if err != nil {
		return nil, statusOf(err)
	}
	h.file = f
	return f, StatusSuccess
}

func (h *handle) closeFile() {
	if h.file != nil {
		_ = h.file.Close()
		h.file = nil
	}
}

func (h *handle) close() {
	h.closeFile()
	if h.deleteOnClose && h.rel != "." {
		// A failed delete is not reported: a close always succeeds.
		_ = h.drive.root.Remove(h.rel)
	}
}

func (h *handle) read(offset float64, length uint32) ([]byte, uint32) {
	if offset < 0 || length > MaxRead {
		return nil, StatusInvalidParameter
	}
	f, st := h.open()
	if st != StatusSuccess {
		return nil, st
	}
	buf := make([]byte, length)
	n, err := f.ReadAt(buf, int64(offset))
	if err != nil && !errors.Is(err, io.EOF) {
		return nil, statusOf(err)
	}
	return buf[:n], StatusSuccess
}

func (h *handle) write(offset float64, data []byte) (int, uint32) {
	if offset < 0 {
		return 0, StatusInvalidParameter
	}
	if !h.writable {
		if h.drive.ReadOnly {
			return 0, StatusMediaWriteProtected
		}
		return 0, StatusAccessDenied
	}
	f, st := h.open()
	if st != StatusSuccess {
		return 0, st
	}
	n, err := f.WriteAt(data, int64(offset))
	if err != nil {
		return n, statusOf(err)
	}
	return n, StatusSuccess
}

func (h *handle) stat() (*FileInfo, uint32) {
	fi, err := statName(h.drive, h.rel)
	if err != nil {
		return nil, statusOf(err)
	}
	info := fileInfo(fi, path.Base(h.rel))
	info.DeletePending = h.deleteOnClose
	return &info, StatusSuccess
}

// list returns the entries of the directory in query (`\dir\pattern`) that
// match its pattern. A pattern without wildcards names one entry.
func (h *handle) list(query string) ([]FileInfo, uint32) {
	dir, pattern := splitQuery(query)
	rel, err := parsePath(dir)
	if err != nil {
		return nil, StatusObjectNameInvalid
	}
	if pattern == "" {
		pattern = "*"
	}
	if !hasWildcards(pattern) {
		if err := checkName(pattern); err != nil {
			return nil, StatusObjectNameInvalid
		}
		name := path.Join(rel, pattern)
		fi, err := statName(h.drive, name)
		if err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				return nil, StatusSuccess // no match
			}
			if isEscape(err) {
				return nil, StatusSuccess // a link out of the drive is not listed
			}
			return nil, statusOf(err)
		}
		return []FileInfo{fileInfo(fi, pattern)}, StatusSuccess
	}

	f, err := h.drive.root.Open(rel)
	if err != nil {
		return nil, statusOf(err)
	}
	defer f.Close()
	self, err := f.Stat()
	if err != nil {
		return nil, statusOf(err)
	}
	if !self.IsDir() {
		return nil, StatusNotADirectory
	}
	var out []FileInfo
	if rel != "." {
		// Windows lists "." and ".." in every folder but a drive's root.
		for _, dot := range []string{".", ".."} {
			if match(pattern, dot) {
				info := fileInfo(self, dot)
				if dot == ".." {
					if parent, err := h.drive.root.Stat(path.Dir(rel)); err == nil {
						info = fileInfo(parent, dot)
					}
				}
				out = append(out, info)
			}
		}
	}
	for {
		entries, err := f.ReadDir(1024)
		for _, e := range entries {
			if len(out) >= MaxListing {
				return out, StatusSuccess
			}
			if !match(pattern, e.Name()) {
				continue
			}
			fi, ierr := e.Info()
			if ierr != nil {
				continue // removed meanwhile
			}
			if isLink(fi) {
				// Follow links that stay inside the drive; skip the others.
				if fi, ierr = h.drive.root.Stat(path.Join(rel, e.Name())); ierr != nil {
					continue
				}
			}
			out = append(out, fileInfo(fi, e.Name()))
		}
		if err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			if len(out) == 0 {
				return nil, statusOf(err)
			}
			break
		}
		if len(entries) == 0 {
			break
		}
	}
	return out, StatusSuccess
}

func (h *handle) setBasic(req Request) uint32 {
	if h.drive.ReadOnly {
		return StatusMediaWriteProtected
	}
	if req.Accessed > 0 || req.Written > 0 {
		fi, err := statName(h.drive, h.rel)
		if err != nil {
			return statusOf(err)
		}
		atime, mtime := fileTimes(fi)
		if req.Accessed > 0 {
			atime = time.UnixMilli(int64(req.Accessed))
		}
		if req.Written > 0 {
			mtime = time.UnixMilli(int64(req.Written))
		}
		if err := h.drive.root.Chtimes(h.rel, atime, mtime); err != nil {
			return statusOf(err)
		}
	}
	if req.Attributes != 0 && !h.dir {
		fi, err := statName(h.drive, h.rel)
		if err != nil {
			return statusOf(err)
		}
		mode := fi.Mode().Perm()
		if req.Attributes&attrReadOnly != 0 {
			mode &^= 0o222
		} else if mode&0o200 == 0 {
			mode |= 0o200
		}
		if mode != fi.Mode().Perm() {
			if err := h.drive.root.Chmod(h.rel, mode); err != nil {
				return statusOf(err)
			}
		}
	}
	return StatusSuccess
}

func (h *handle) setSize(size float64) uint32 {
	if size < 0 {
		return StatusInvalidParameter
	}
	if !h.writable {
		if h.drive.ReadOnly {
			return StatusMediaWriteProtected
		}
		return StatusAccessDenied
	}
	f, st := h.open()
	if st != StatusSuccess {
		return st
	}
	if err := f.Truncate(int64(size)); err != nil {
		return statusOf(err)
	}
	return StatusSuccess
}

func (h *handle) setDelete(del bool) uint32 {
	if h.drive.ReadOnly {
		return StatusMediaWriteProtected
	}
	if !h.mayDelete || h.rel == "." {
		return StatusAccessDenied
	}
	if del {
		fi, err := statName(h.drive, h.rel)
		if err != nil {
			return statusOf(err)
		}
		if fi.IsDir() {
			f, err := h.drive.root.Open(h.rel)
			if err != nil {
				return statusOf(err)
			}
			names, _ := f.Readdirnames(1)
			f.Close()
			if len(names) > 0 {
				return StatusDirectoryNotEmpty
			}
		} else if fi.Mode().Perm()&0o200 == 0 {
			// Windows refuses to delete a read-only file.
			return StatusCannotDelete
		}
	}
	h.deleteOnClose = del
	return StatusSuccess
}

// StatusCannotDelete is STATUS_CANNOT_DELETE.
const StatusCannotDelete uint32 = 0xC0000121

func (s *Session) rename(h *handle, to string, replace bool) uint32 {
	if h.drive.ReadOnly {
		return StatusMediaWriteProtected
	}
	if !h.mayDelete || h.rel == "." {
		return StatusAccessDenied
	}
	target, err := parsePath(to)
	if err != nil || target == "." {
		return StatusObjectNameInvalid
	}
	if target == h.rel {
		return StatusSuccess
	}
	if fi, err := h.drive.root.Lstat(target); err == nil {
		// A case-only rename names the same file on a case-insensitive disk.
		same := strings.EqualFold(target, h.rel)
		if !same {
			if !replace {
				return StatusObjectNameCollision
			}
			if fi.IsDir() {
				return StatusAccessDenied
			}
		}
	}
	// Windows can't rename a file that is open, here or through another handle.
	h.closeFile()
	for _, other := range s.handles {
		if other.drive == h.drive && (other.rel == h.rel || strings.HasPrefix(other.rel, h.rel+"/")) {
			other.closeFile()
		}
	}
	if err := h.drive.root.Rename(h.rel, target); err != nil {
		return statusOfCreate(h.drive, target, err)
	}
	old := h.rel
	for _, other := range s.handles {
		if other.drive != h.drive {
			continue
		}
		if other.rel == old {
			other.rel = target
		} else if strings.HasPrefix(other.rel, old+"/") {
			other.rel = target + other.rel[len(old):]
		}
	}
	return StatusSuccess
}

// isLink reports a symbolic link, or anything else that isn't a plain file or
// directory, such as a Windows junction (which Go reports as irregular).
func isLink(fi fs.FileInfo) bool {
	return fi.Mode().Type()&^fs.ModeDir != 0
}

func fileInfo(fi fs.FileInfo, name string) FileInfo {
	created, accessed, written := fileTimesAll(fi)
	info := FileInfo{
		Name:     name,
		Dir:      fi.IsDir(),
		Created:  ms(created),
		Accessed: ms(accessed),
		Written:  ms(written),
		Changed:  ms(written),
	}
	if !info.Dir {
		info.Size = fi.Size()
	}
	info.Attributes = attributes(fi, name)
	return info
}

func ms(t time.Time) float64 {
	if t.IsZero() {
		return 0
	}
	return float64(t.UnixMilli())
}

// fileTimes returns the access and modification times of fi.
func fileTimes(fi fs.FileInfo) (atime, mtime time.Time) {
	_, atime, mtime = fileTimesAll(fi)
	return atime, mtime
}
