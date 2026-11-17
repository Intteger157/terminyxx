//go:build windows && (amd64 || arm64)

package dragout

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
	"unicode/utf16"
	"unsafe"

	"golang.org/x/sys/windows"
)

// A drag source written as raw COM (no CGO), like the Windows Hello code in
// internal/security. The data object offers CFSTR_FILEDESCRIPTORW and
// CFSTR_FILECONTENTS ("virtual files"); each file's contents are an IStream
// that reads from the server only when the drop target asks for it.
//
// Only 64-bit targets are supported: LARGE_INTEGER arguments are passed by
// value and callbacks assume one register per argument.

var (
	ole32                     = windows.NewLazySystemDLL("ole32.dll")
	procOleInitialize         = ole32.NewProc("OleInitialize")
	procOleUninitialize       = ole32.NewProc("OleUninitialize")
	procDoDragDrop            = ole32.NewProc("DoDragDrop")
	user32                    = windows.NewLazySystemDLL("user32.dll")
	procRegisterClipboardFmt  = user32.NewProc("RegisterClipboardFormatW")
	procRegisterWindowMessage = user32.NewProc("RegisterWindowMessageW")
	procPostMessage           = user32.NewProc("PostMessageW")
	procSetWindowLongPtr      = user32.NewProc("SetWindowLongPtrW")
	procCallWindowProc        = user32.NewProc("CallWindowProcW")
	procGetAncestor           = user32.NewProc("GetAncestor")
	procGetCursorPos          = user32.NewProc("GetCursorPos")
	procWindowFromPoint       = user32.NewProc("WindowFromPoint")
	procGetWindowThreadPID    = user32.NewProc("GetWindowThreadProcessId")
	procGetGUIThreadInfo      = user32.NewProc("GetGUIThreadInfo")
	procGetForegroundWindow   = user32.NewProc("GetForegroundWindow")
	kernel32                  = windows.NewLazySystemDLL("kernel32.dll")
	procGlobalAlloc           = kernel32.NewProc("GlobalAlloc")
	procGlobalLock            = kernel32.NewProc("GlobalLock")
	procGlobalUnlock          = kernel32.NewProc("GlobalUnlock")
	procGlobalFree            = kernel32.NewProc("GlobalFree")
)

// HRESULTs, as 32-bit patterns.
const (
	sOK                    = 0x00000000
	sFalse                 = 0x00000001
	eNotImpl               = 0x80004001
	eNoInterface           = 0x80004002
	eFail                  = 0x80004005
	eInvalidArg            = 0x80070057
	dvEFormatEtc           = 0x80040064
	dvETymed               = 0x80040069
	dvELIndex              = 0x80040068
	oleEAdviseNotSupported = 0x80040003
	stgEInvalidFunction    = 0x80030001
	stgEAccessDenied       = 0x80030005
	stgEReadFault          = 0x8003001E
	dataSSameFormatEtc     = 0x00040130
	dragDropSDrop          = 0x00040100
	dragDropSCancel        = 0x00040101
	dragDropSUseDefault    = 0x00040102
)

const (
	gmemMoveable = 0x0002

	tymedHGlobal = 1
	tymedIStream = 4

	dvAspectContent = 1
	dataDirGet      = 1
	dropEffectCopy  = 1
	mkLButton       = 1

	fdAttributes = 0x00000004
	fdWritesTime = 0x00000020
	fdFileSize   = 0x00000040
	fdProgressUI = 0x00004000

	fileAttrDirectory = 0x10
	fileAttrNormal    = 0x80

	stgtyStream = 2

	seekSet = 0
	seekCur = 1
	seekEnd = 2

	fdSize       = 592 // sizeof(FILEDESCRIPTORW)
	fdNameOffset = 72
	maxNameUnits = 259
	gaRoot       = 2
	gwlpWndProc  = ^uintptr(3) // -4
)

var (
	iidUnknown        = windows.GUID{Data1: 0x00000000, Data2: 0, Data3: 0, Data4: [8]byte{0xC0, 0, 0, 0, 0, 0, 0, 0x46}}
	iidDataObject     = windows.GUID{Data1: 0x0000010e, Data2: 0, Data3: 0, Data4: [8]byte{0xC0, 0, 0, 0, 0, 0, 0, 0x46}}
	iidEnumFormatEtc  = windows.GUID{Data1: 0x00000103, Data2: 0, Data3: 0, Data4: [8]byte{0xC0, 0, 0, 0, 0, 0, 0, 0x46}}
	iidDropSource     = windows.GUID{Data1: 0x00000121, Data2: 0, Data3: 0, Data4: [8]byte{0xC0, 0, 0, 0, 0, 0, 0, 0x46}}
	iidStream         = windows.GUID{Data1: 0x0000000c, Data2: 0, Data3: 0, Data4: [8]byte{0xC0, 0, 0, 0, 0, 0, 0, 0x46}}
	iidSequentialStrm = windows.GUID{Data1: 0x0000000a, Data2: 0, Data3: 0, Data4: [8]byte{0xC0, 0, 0, 0, 0, 0, 0, 0x46}}
)

type formatEtc struct {
	CF     uint16
	Ptd    uintptr
	Aspect uint32
	Index  int32
	Tymed  uint32
}

type stgMedium struct {
	Tymed   uint32
	U       uintptr
	Release uintptr
}

type statstg struct {
	Name    uintptr
	Type    uint32
	Size    uint64
	Mtime   [2]uint32
	Ctime   [2]uint32
	Atime   [2]uint32
	Mode    uint32
	Locks   uint32
	CLSID   [16]byte
	State   uint32
	Padding uint32
}

// ptr turns a pointer received from COM into an unsafe.Pointer. The memory is
// owned by the caller (or the OS), never by the Go heap.
func ptr(p uintptr) unsafe.Pointer { return *(*unsafe.Pointer)(unsafe.Pointer(&p)) }

// refObj is any COM object we hand out.
type refObj interface {
	addRef() int32
	release() int32
}

var (
	regMu sync.Mutex
	reg   = map[uintptr]refObj{}
)

func register(addr uintptr, o refObj) {
	regMu.Lock()
	reg[addr] = o
	regMu.Unlock()
}

func unregister(addr uintptr) {
	regMu.Lock()
	delete(reg, addr)
	regMu.Unlock()
}

func lookup[T refObj](this uintptr) (T, bool) {
	regMu.Lock()
	defer regMu.Unlock()
	o, ok := reg[this].(T)
	return o, ok
}

func comAddRef(this uintptr) uintptr {
	regMu.Lock()
	o := reg[this]
	regMu.Unlock()
	if o == nil {
		return 0
	}
	return uintptr(o.addRef())
}

func comRelease(this uintptr) uintptr {
	regMu.Lock()
	o := reg[this]
	regMu.Unlock()
	if o == nil {
		return 0
	}
	return uintptr(o.release())
}

// queryInterface answers QueryInterface for an object that implements iid
// (and IUnknown).
func queryInterface(this, riid, ppv uintptr, iids ...windows.GUID) uintptr {
	if ppv == 0 {
		return eInvalidArg
	}
	*(*uintptr)(ptr(ppv)) = 0
	if riid == 0 {
		return eInvalidArg
	}
	g := *(*windows.GUID)(ptr(riid))
	match := g == iidUnknown
	for _, want := range iids {
		if g == want {
			match = true
		}
	}
	if !match {
		return eNoInterface
	}
	*(*uintptr)(ptr(ppv)) = this
	comAddRef(this)
	return sOK
}

// guard keeps a Go panic from unwinding into the COM caller.
func guard(f func() uintptr) (r uintptr) {
	defer func() {
		if recover() != nil {
			r = eFail
		}
	}()
	return f()
}

var cbCache []uintptr

func cb(f any) uintptr {
	p := syscall.NewCallback(f)
	cbCache = append(cbCache, p)
	return p
}

// vtbl pointers, built once. The slices are never freed.
var (
	initOnce   sync.Once
	dataVtbl   []uintptr
	enumVtbl   []uintptr
	srcVtbl    []uintptr
	streamVtbl []uintptr
)

func initVtbls() {
	qiData := func(this, riid, ppv uintptr) uintptr {
		return guard(func() uintptr { return queryInterface(this, riid, ppv, iidDataObject) })
	}
	addRef := func(this uintptr) uintptr { return comAddRef(this) }
	release := func(this uintptr) uintptr { return comRelease(this) }

	dataVtbl = []uintptr{
		cb(qiData), cb(addRef), cb(release),
		cb(func(this, fe, med uintptr) uintptr {
			return guard(func() uintptr { return dataGetData(this, fe, med) })
		}),
		cb(func(this, fe, med uintptr) uintptr { return eNotImpl }), // GetDataHere
		cb(func(this, fe uintptr) uintptr { return guard(func() uintptr { return dataQueryGetData(this, fe) }) }),
		cb(func(this, in, out uintptr) uintptr { // GetCanonicalFormatEtc
			if out != 0 {
				(*formatEtc)(ptr(out)).Ptd = 0
			}
			return dataSSameFormatEtc
		}),
		cb(func(this, fe, med, rel uintptr) uintptr { return eNotImpl }), // SetData
		cb(func(this, dir, ppenum uintptr) uintptr {
			return guard(func() uintptr { return dataEnum(this, dir, ppenum) })
		}),
		cb(func(this, fe, adv, sink, conn uintptr) uintptr { return oleEAdviseNotSupported }),
		cb(func(this, conn uintptr) uintptr { return oleEAdviseNotSupported }),
		cb(func(this, pp uintptr) uintptr { return oleEAdviseNotSupported }),
	}

	enumVtbl = []uintptr{
		cb(func(this, riid, ppv uintptr) uintptr {
			return guard(func() uintptr { return queryInterface(this, riid, ppv, iidEnumFormatEtc) })
		}),
		cb(addRef), cb(release),
		cb(func(this, celt, rgelt, fetched uintptr) uintptr {
			return guard(func() uintptr { return enumNext(this, celt, rgelt, fetched) })
		}),
		cb(func(this, celt uintptr) uintptr { return guard(func() uintptr { return enumSkip(this, celt) }) }),
		cb(func(this uintptr) uintptr {
			if e, ok := lookup[*enumFmt](this); ok {
				e.pos.Store(0)
			}
			return sOK
		}),
		cb(func(this, ppenum uintptr) uintptr { return guard(func() uintptr { return enumClone(this, ppenum) }) }),
	}

	srcVtbl = []uintptr{
		cb(func(this, riid, ppv uintptr) uintptr {
			return guard(func() uintptr { return queryInterface(this, riid, ppv, iidDropSource) })
		}),
		cb(addRef), cb(release),
		cb(func(this, escape, keys uintptr) uintptr {
			return guard(func() uintptr { return queryContinueDrag(escape, keys) })
		}),
		cb(func(this, effect uintptr) uintptr { return dragDropSUseDefault }), // GiveFeedback
	}

	streamVtbl = []uintptr{
		cb(func(this, riid, ppv uintptr) uintptr {
			return guard(func() uintptr { return queryInterface(this, riid, ppv, iidStream, iidSequentialStrm) })
		}),
		cb(addRef), cb(release),
		cb(func(this, pv, n, pread uintptr) uintptr {
			return guard(func() uintptr { return streamRead(this, pv, n, pread) })
		}),
		cb(func(this, pv, n, pwritten uintptr) uintptr { return stgEAccessDenied }),
		cb(func(this, move, origin, pnew uintptr) uintptr {
			return guard(func() uintptr { return streamSeek(this, int64(move), origin, pnew) })
		}),
		cb(func(this, size uintptr) uintptr { return stgEAccessDenied }),            // SetSize
		cb(func(this, stm, n, pread, pwritten uintptr) uintptr { return eNotImpl }), // CopyTo
		cb(func(this, flags uintptr) uintptr { return sOK }),                        // Commit
		cb(func(this uintptr) uintptr { return sOK }),                               // Revert
		cb(func(this, off, n, typ uintptr) uintptr { return stgEInvalidFunction }),  // LockRegion
		cb(func(this, off, n, typ uintptr) uintptr { return stgEInvalidFunction }),  // UnlockRegion
		cb(func(this, pst, flags uintptr) uintptr { return guard(func() uintptr { return streamStat(this, pst) }) }),
		cb(func(this, ppstm uintptr) uintptr { return eNotImpl }), // Clone
	}
}

// ---- IDataObject ----

type dataObject struct {
	vtbl  uintptr
	refs  atomic.Int32
	items []Item
	open  OpenFunc
	fdFmt uint16
	fcFmt uint16
	done  chan struct{}
	last  atomic.Int64 // unix nanos of the last request from the drop target
}

func (d *dataObject) addRef() int32 { return d.refs.Add(1) }
func (d *dataObject) release() int32 {
	n := d.refs.Add(-1)
	if n == 0 {
		unregister(uintptr(unsafe.Pointer(d)))
		close(d.done)
	}
	return n
}

func (d *dataObject) touch() { d.last.Store(time.Now().UnixNano()) }

func (d *dataObject) acceptable(fe *formatEtc) uintptr {
	if fe.Aspect != dvAspectContent {
		return dvEFormatEtc
	}
	switch fe.CF {
	case d.fdFmt:
		if fe.Tymed&tymedHGlobal == 0 {
			return dvETymed
		}
		return sOK
	case d.fcFmt:
		if fe.Tymed&tymedIStream == 0 {
			return dvETymed
		}
		return sOK
	}
	return dvEFormatEtc
}

func dataQueryGetData(this, fe uintptr) uintptr {
	d, ok := lookup[*dataObject](this)
	if !ok || fe == 0 {
		return eInvalidArg
	}
	f := (*formatEtc)(ptr(fe))
	hr := d.acceptable(f)
	return hr
}

func dataGetData(this, fePtr, medPtr uintptr) uintptr {
	d, ok := lookup[*dataObject](this)
	if !ok || fePtr == 0 || medPtr == 0 {
		return eInvalidArg
	}
	d.touch()
	fe := (*formatEtc)(ptr(fePtr))
	med := (*stgMedium)(ptr(medPtr))
	if hr := d.acceptable(fe); hr != sOK {
		return hr
	}
	*med = stgMedium{}
	if fe.CF == d.fdFmt {
		h, err := d.descriptor()
		if err != nil {
			return eFail
		}
		med.Tymed = tymedHGlobal
		med.U = h
		return sOK
	}
	i := int(fe.Index)
	if i < 0 || i >= len(d.items) {
		return dvELIndex
	}
	if d.items[i].IsDir {
		return dvEFormatEtc
	}
	r, err := d.open(i)
	if err != nil {
		return stgEAccessDenied
	}
	s := &stream{r: r, size: d.items[i].Size, owner: d}
	s.refs.Store(1)
	s.vtbl = uintptr(unsafe.Pointer(&streamVtbl[0]))
	d.addRef() // a stream keeps the data object (and its open func) alive
	addr := uintptr(unsafe.Pointer(s))
	register(addr, s)
	med.Tymed = tymedIStream
	med.U = addr
	return sOK
}

// descriptor builds the FILEGROUPDESCRIPTORW global memory block.
func (d *dataObject) descriptor() (uintptr, error) {
	buf := make([]byte, 4+fdSize*len(d.items))
	binary.LittleEndian.PutUint32(buf, uint32(len(d.items)))
	for i, it := range d.items {
		b := buf[4+fdSize*i : 4+fdSize*(i+1)]
		flags := uint32(fdAttributes | fdWritesTime | fdProgressUI)
		attr := uint32(fileAttrNormal)
		if it.IsDir {
			attr = fileAttrDirectory
		} else {
			flags |= fdFileSize
			binary.LittleEndian.PutUint32(b[64:], uint32(uint64(it.Size)>>32))
			binary.LittleEndian.PutUint32(b[68:], uint32(uint64(it.Size)))
		}
		binary.LittleEndian.PutUint32(b[0:], flags)
		binary.LittleEndian.PutUint32(b[36:], attr)
		if !it.ModTime.IsZero() {
			ft := uint64(it.ModTime.UnixNano()/100) + 116444736000000000
			binary.LittleEndian.PutUint32(b[56:], uint32(ft))
			binary.LittleEndian.PutUint32(b[60:], uint32(ft>>32))
		}
		name := utf16.Encode([]rune(it.Name))
		if len(name) > maxNameUnits {
			return 0, fmt.Errorf("path too long: %s", it.Name)
		}
		for j, u := range name {
			binary.LittleEndian.PutUint16(b[fdNameOffset+2*j:], u)
		}
	}
	h, _, err := procGlobalAlloc.Call(gmemMoveable, uintptr(len(buf)))
	if h == 0 {
		return 0, err
	}
	p, _, err := procGlobalLock.Call(h)
	if p == 0 {
		procGlobalFree.Call(h)
		return 0, err
	}
	copy(unsafe.Slice((*byte)(ptr(p)), len(buf)), buf)
	procGlobalUnlock.Call(h)
	return h, nil
}

func dataEnum(this, dir, ppenum uintptr) uintptr {
	d, ok := lookup[*dataObject](this)
	if !ok || ppenum == 0 {
		return eInvalidArg
	}
	if dir != dataDirGet {
		return eNotImpl
	}
	e := &enumFmt{fmts: []formatEtc{
		{CF: d.fdFmt, Aspect: dvAspectContent, Index: -1, Tymed: tymedHGlobal},
		{CF: d.fcFmt, Aspect: dvAspectContent, Index: -1, Tymed: tymedIStream},
	}}
	*(*uintptr)(ptr(ppenum)) = newEnum(e)
	return sOK
}

// ---- IEnumFORMATETC ----

type enumFmt struct {
	vtbl uintptr
	refs atomic.Int32
	fmts []formatEtc
	pos  atomic.Int32
}

func newEnum(e *enumFmt) uintptr {
	e.vtbl = uintptr(unsafe.Pointer(&enumVtbl[0]))
	e.refs.Store(1)
	addr := uintptr(unsafe.Pointer(e))
	register(addr, e)
	return addr
}

func (e *enumFmt) addRef() int32 { return e.refs.Add(1) }
func (e *enumFmt) release() int32 {
	n := e.refs.Add(-1)
	if n == 0 {
		unregister(uintptr(unsafe.Pointer(e)))
	}
	return n
}

func enumNext(this, celt, rgelt, fetched uintptr) uintptr {
	e, ok := lookup[*enumFmt](this)
	if !ok || rgelt == 0 {
		return eInvalidArg
	}
	n := 0
	out := unsafe.Slice((*formatEtc)(ptr(rgelt)), int(celt))
	for n < int(celt) && int(e.pos.Load()) < len(e.fmts) {
		out[n] = e.fmts[e.pos.Load()]
		e.pos.Add(1)
		n++
	}
	if fetched != 0 {
		*(*uint32)(ptr(fetched)) = uint32(n)
	}
	if n < int(celt) {
		return sFalse
	}
	return sOK
}

func enumSkip(this, celt uintptr) uintptr {
	e, ok := lookup[*enumFmt](this)
	if !ok {
		return eInvalidArg
	}
	next := int(e.pos.Load()) + int(celt)
	if next > len(e.fmts) {
		e.pos.Store(int32(len(e.fmts)))
		return sFalse
	}
	e.pos.Store(int32(next))
	return sOK
}

func enumClone(this, ppenum uintptr) uintptr {
	e, ok := lookup[*enumFmt](this)
	if !ok || ppenum == 0 {
		return eInvalidArg
	}
	c := &enumFmt{fmts: e.fmts}
	c.pos.Store(e.pos.Load())
	*(*uintptr)(ptr(ppenum)) = newEnum(c)
	return sOK
}

// ---- IDropSource ----

type dropSource struct {
	vtbl uintptr
	refs atomic.Int32
}

func (s *dropSource) addRef() int32 { return s.refs.Add(1) }
func (s *dropSource) release() int32 {
	n := s.refs.Add(-1)
	if n == 0 {
		unregister(uintptr(unsafe.Pointer(s)))
	}
	return n
}

// overOwnWindow reports whether the cursor is above a window of this process.
func overOwnWindow() bool {
	var pt [2]int32
	if r, _, _ := procGetCursorPos.Call(uintptr(unsafe.Pointer(&pt[0]))); r == 0 {
		return false
	}
	packed := uintptr(uint64(uint32(pt[1]))<<32 | uint64(uint32(pt[0])))
	hwnd, _, _ := procWindowFromPoint.Call(packed)
	if hwnd == 0 {
		return false
	}
	var pid uint32
	procGetWindowThreadPID.Call(hwnd, uintptr(unsafe.Pointer(&pid)))
	return pid == windows.GetCurrentProcessId()
}

func queryContinueDrag(escape, keys uintptr) uintptr {
	if escape != 0 {
		return dragDropSCancel
	}
	if keys&mkLButton == 0 {
		// Letting go over our own window is not a drop (the in-app drag
		// between the two panes has its own handling).
		if overOwnWindow() {
			return dragDropSCancel
		}
		return dragDropSDrop
	}
	return sOK
}

// ---- IStream (one file's contents) ----

type stream struct {
	vtbl  uintptr
	refs  atomic.Int32
	owner *dataObject
	size  int64

	mu  sync.Mutex
	r   io.ReadCloser
	pos int64
}

func (s *stream) addRef() int32 { return s.refs.Add(1) }
func (s *stream) release() int32 {
	n := s.refs.Add(-1)
	if n == 0 {
		unregister(uintptr(unsafe.Pointer(s)))
		s.mu.Lock()
		if s.r != nil {
			s.r.Close()
			s.r = nil
		}
		s.mu.Unlock()
		s.owner.release()
	}
	return n
}

func streamRead(this, pv, n, pread uintptr) uintptr {
	s, ok := lookup[*stream](this)
	if !ok || pv == 0 {
		return eInvalidArg
	}
	s.owner.touch()
	s.mu.Lock()
	defer s.mu.Unlock()
	var got int
	if n > 0 && s.r != nil {
		dst := unsafe.Slice((*byte)(ptr(pv)), int(n))
		var err error
		got, err = io.ReadFull(s.r, dst)
		if err != nil && !errors.Is(err, io.EOF) && !errors.Is(err, io.ErrUnexpectedEOF) {
			if pread != 0 {
				*(*uint32)(ptr(pread)) = uint32(got)
			}
			return stgEReadFault
		}
	}
	s.pos += int64(got)
	if pread != 0 {
		*(*uint32)(ptr(pread)) = uint32(got)
	}
	if got == 0 && n > 0 {
		return sFalse
	}
	return sOK
}

func streamSeek(this uintptr, move int64, origin, pnew uintptr) uintptr {
	s, ok := lookup[*stream](this)
	if !ok {
		return eInvalidArg
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	var target int64
	switch origin {
	case seekSet:
		target = move
	case seekCur:
		target = s.pos + move
	case seekEnd:
		// Callers use this to learn the size; answer without moving.
		if move != 0 {
			return stgEInvalidFunction
		}
		if pnew != 0 {
			*(*uint64)(ptr(pnew)) = uint64(s.size)
		}
		return sOK
	default:
		return stgEInvalidFunction
	}
	if target != s.pos {
		return stgEInvalidFunction // the stream is forward-only
	}
	if pnew != 0 {
		*(*uint64)(ptr(pnew)) = uint64(s.pos)
	}
	return sOK
}

func streamStat(this, pst uintptr) uintptr {
	s, ok := lookup[*stream](this)
	if !ok || pst == 0 {
		return eInvalidArg
	}
	*(*statstg)(ptr(pst)) = statstg{Type: stgtyStream, Size: uint64(s.size)}
	return sOK
}

// ---- running a drag ----

func clipboardFormat(name string) (uint16, error) {
	p, err := windows.UTF16PtrFromString(name)
	if err != nil {
		return 0, err
	}
	r, _, e := procRegisterClipboardFmt.Call(uintptr(unsafe.Pointer(p)))
	if r == 0 {
		return 0, e
	}
	return uint16(r), nil
}

type guiThreadInfo struct {
	Size      uint32
	Flags     uint32
	Active    uintptr
	Focus     uintptr
	Capture   uintptr
	MenuOwner uintptr
	MoveSize  uintptr
	Caret     uintptr
	CaretRect [4]int32
}

// appWindow returns the top-level window of this process that holds the
// mouse (the button went down in its webview) or, failing that, the active
// or foreground window. It returns 0 if none belongs to this process.
func appWindow() uintptr {
	info := new(guiThreadInfo)
	info.Size = uint32(unsafe.Sizeof(*info))
	var hwnd uintptr
	if r, _, _ := procGetGUIThreadInfo.Call(0, uintptr(unsafe.Pointer(info))); r != 0 {
		hwnd = info.Capture
		if hwnd == 0 {
			hwnd = info.Active
		}
	}
	if hwnd == 0 {
		hwnd, _, _ = procGetForegroundWindow.Call()
	}
	if hwnd == 0 {
		return 0
	}
	if root, _, _ := procGetAncestor.Call(hwnd, gaRoot); root != 0 {
		hwnd = root
	}
	var pid uint32
	procGetWindowThreadPID.Call(hwnd, uintptr(unsafe.Pointer(&pid)))
	if pid != windows.GetCurrentProcessId() {
		return 0
	}
	return hwnd
}

// The drag has to run on the thread that owns the window: only that thread
// knows the button is down and may take the mouse capture, and DoDragDrop
// started anywhere else never gets going. We subclass the window once and
// post it a private message that runs the queued job.
var (
	uiMu      sync.Mutex
	uiPrev    = map[uintptr]uintptr{} // hwnd -> previous window procedure
	uiProc    uintptr
	uiMsg     uint32
	uiJob     = make(chan func(), 1)
	uiMsgOnce sync.Once
)

func uiWndProc(hwnd, m, wp, lp uintptr) uintptr {
	if uiMsg != 0 && uint32(m) == uiMsg {
		select {
		case job := <-uiJob:
			guard(func() uintptr { job(); return 0 })
		default:
		}
		return 0
	}
	uiMu.Lock()
	prev := uiPrev[hwnd]
	uiMu.Unlock()
	r, _, _ := procCallWindowProc.Call(prev, hwnd, m, wp, lp)
	return r
}

func subclass(hwnd uintptr) error {
	uiMsgOnce.Do(func() {
		name, _ := windows.UTF16PtrFromString("TerminyxxDragOut")
		r, _, _ := procRegisterWindowMessage.Call(uintptr(unsafe.Pointer(name)))
		uiMsg = uint32(r)
		uiProc = syscall.NewCallback(uiWndProc)
	})
	if uiMsg == 0 {
		return errors.New("RegisterWindowMessage failed")
	}
	uiMu.Lock()
	defer uiMu.Unlock()
	if _, ok := uiPrev[hwnd]; ok {
		return nil
	}
	// Holding uiMu until the old procedure is recorded keeps the window's
	// thread from calling uiWndProc without one.
	prev, _, err := procSetWindowLongPtr.Call(hwnd, gwlpWndProc, uiProc)
	if prev == 0 {
		return fmt.Errorf("SetWindowLongPtr: %v", err)
	}
	uiPrev[hwnd] = prev
	return nil
}

// onUIThread runs job on the thread that owns hwnd and waits for it.
func onUIThread(hwnd uintptr, job func()) error {
	if err := subclass(hwnd); err != nil {
		return err
	}
	done := make(chan struct{})
	select {
	case uiJob <- func() { defer close(done); job() }:
	default:
		return errors.New("a drag is already in progress")
	}
	if r, _, err := procPostMessage.Call(hwnd, uintptr(uiMsg), 0, 0); r == 0 {
		select {
		case <-uiJob:
		default:
		}
		return fmt.Errorf("PostMessage: %v", err)
	}
	<-done
	return nil
}

// Start begins dragging the items out of the app and blocks until the drag
// ends. The left mouse button must be held down in the app's window when it
// is called. It reports whether the items were dropped on another
// application.
func Start(items []Item, open OpenFunc) (bool, error) {
	if len(items) == 0 {
		return false, errors.New("nothing to drag")
	}
	hwnd := appWindow()
	if hwnd == 0 {
		return false, errors.New("the app window is not active")
	}
	var (
		dropped bool
		runErr  error
	)
	if err := onUIThread(hwnd, func() { dropped, runErr = run(items, open) }); err != nil {
		return false, err
	}
	return dropped, runErr
}

func run(items []Item, open OpenFunc) (bool, error) {
	initOnce.Do(initVtbls)
	// The window's thread already uses COM (WebView2); this only adds OLE.
	if hr, _, _ := procOleInitialize.Call(0); int32(hr) < 0 {
		return false, fmt.Errorf("OleInitialize failed: 0x%08x", uint32(hr))
	}
	defer procOleUninitialize.Call()

	fd, err := clipboardFormat("FileGroupDescriptorW")
	if err != nil {
		return false, err
	}
	fc, err := clipboardFormat("FileContents")
	if err != nil {
		return false, err
	}

	data := &dataObject{items: items, open: open, fdFmt: fd, fcFmt: fc, done: make(chan struct{})}
	data.vtbl = uintptr(unsafe.Pointer(&dataVtbl[0]))
	data.refs.Store(1)
	dataAddr := uintptr(unsafe.Pointer(data))
	register(dataAddr, data)

	src := &dropSource{}
	src.vtbl = uintptr(unsafe.Pointer(&srcVtbl[0]))
	src.refs.Store(1)
	srcAddr := uintptr(unsafe.Pointer(src))
	register(srcAddr, src)
	defer comRelease(srcAddr)

	var effect uint32
	hr, _, _ := procDoDragDrop.Call(dataAddr, srcAddr, dropEffectCopy, uintptr(unsafe.Pointer(&effect)))
	dropped := uint32(hr) == dragDropSDrop && effect != 0

	data.touch()
	// Ours; a drop target that still holds references keeps the object
	// alive, and its calls arrive through this thread's message loop.
	comRelease(dataAddr)
	if int32(hr) < 0 {
		return false, fmt.Errorf("DoDragDrop failed: 0x%08x", uint32(hr))
	}
	return dropped, nil
}
