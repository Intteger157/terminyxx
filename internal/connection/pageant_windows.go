package connection

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"os"
	"runtime"
	"sync"
	"sync/atomic"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Pageant (PuTTY's agent) speaks the ssh-agent protocol over WM_COPYDATA: the
// request is written to a named shared memory block, the block's name is sent
// to the "Pageant" window, and the reply comes back in the same block. Every
// Pageant version supports this (newer ones also have a named pipe whose name
// is derived from a per-user secret).

const (
	pageantCopyDataID = 0x804e50ba
	pageantMaxMsg     = 8192
	wmCopyData        = 0x004A
)

var (
	user32           = windows.NewLazySystemDLL("user32.dll")
	procFindWindowW  = user32.NewProc("FindWindowW")
	procSendMessageW = user32.NewProc("SendMessageW")
	pageantSeq       atomic.Uint32
	// pageantClass is the window class and title Pageant registers (tests change it).
	pageantClass = "Pageant"
)

type copyDataStruct struct {
	dwData uintptr
	cbData uint32
	lpData uintptr
}

func pageantWindow() uintptr {
	name, _ := windows.UTF16PtrFromString(pageantClass)
	hwnd, _, _ := procFindWindowW.Call(uintptr(unsafe.Pointer(name)), uintptr(unsafe.Pointer(name)))
	return hwnd
}

// dialPageant returns a connection to a running Pageant, or nil.
func dialPageant() io.ReadWriteCloser {
	if pageantWindow() == 0 {
		return nil
	}
	c := &pageantConn{}
	c.cond = sync.NewCond(&c.mu)
	return c
}

// pageantConn turns the agent client's framed writes into Pageant queries.
// Read blocks until a reply is there (the agent client reads in a goroutine
// of its own), like a socket would.
type pageantConn struct {
	mu        sync.Mutex
	cond      *sync.Cond
	req, resp bytes.Buffer
	closed    bool
}

func (c *pageantConn) Write(p []byte) (int, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return 0, os.ErrClosed
	}
	c.req.Write(p)
	for c.req.Len() >= 4 {
		n := int(binary.BigEndian.Uint32(c.req.Bytes()))
		if 4+n > pageantMaxMsg {
			c.req.Reset()
			return 0, errors.New("pageant: request too large")
		}
		if c.req.Len() < 4+n {
			break
		}
		reply, err := pageantQuery(c.req.Next(4 + n))
		if err != nil {
			return 0, err
		}
		c.resp.Write(reply)
		c.cond.Broadcast()
	}
	return len(p), nil
}

func (c *pageantConn) Read(p []byte) (int, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for c.resp.Len() == 0 && !c.closed {
		c.cond.Wait()
	}
	if c.resp.Len() == 0 {
		return 0, io.EOF
	}
	return c.resp.Read(p)
}

func (c *pageantConn) Close() error {
	c.mu.Lock()
	c.closed = true
	c.cond.Broadcast()
	c.mu.Unlock()
	return nil
}

// pageantQuery sends one framed request and returns the framed reply.
func pageantQuery(msg []byte) ([]byte, error) {
	hwnd := pageantWindow()
	if hwnd == 0 {
		return nil, errors.New("pageant is not running")
	}
	// Pageant only answers a block owned by its own user; the DACL keeps
	// other users' processes from reading or changing it meanwhile.
	tu, err := windows.GetCurrentProcessToken().GetTokenUser()
	if err != nil {
		return nil, err
	}
	sid := tu.User.Sid.String()
	sd, err := windows.SecurityDescriptorFromString("O:" + sid + "D:P(A;;GA;;;" + sid + ")")
	if err != nil {
		return nil, err
	}
	sa := &windows.SecurityAttributes{Length: uint32(unsafe.Sizeof(windows.SecurityAttributes{})), SecurityDescriptor: sd}
	name := fmt.Sprintf("PageantRequest%08x%04x", windows.GetCurrentProcessId(), pageantSeq.Add(1)&0xffff)
	name16, _ := windows.UTF16PtrFromString(name)
	h, err := windows.CreateFileMapping(windows.InvalidHandle, sa, windows.PAGE_READWRITE, 0, pageantMaxMsg, name16)
	if err != nil {
		return nil, fmt.Errorf("pageant: %w", err)
	}
	defer windows.CloseHandle(h)
	addr, err := windows.MapViewOfFile(h, windows.FILE_MAP_WRITE, 0, 0, 0)
	if err != nil {
		return nil, fmt.Errorf("pageant: %w", err)
	}
	defer windows.UnmapViewOfFile(addr)
	// addr is memory the OS mapped, not Go memory, so the GC never moves it.
	view := unsafe.Slice((*byte)(unsafe.Add(nil, addr)), pageantMaxMsg)
	copy(view, msg)

	ansi := append([]byte(name), 0)
	cds := copyDataStruct{dwData: pageantCopyDataID, cbData: uint32(len(ansi)), lpData: uintptr(unsafe.Pointer(&ansi[0]))}
	ret, _, _ := procSendMessageW.Call(hwnd, wmCopyData, 0, uintptr(unsafe.Pointer(&cds)))
	runtime.KeepAlive(ansi)
	runtime.KeepAlive(&cds)
	if ret == 0 {
		return nil, errors.New("pageant refused the request")
	}
	n := int(binary.BigEndian.Uint32(view))
	if 4+n > pageantMaxMsg {
		return nil, errors.New("pageant: reply too large")
	}
	return append([]byte(nil), view[:4+n]...), nil
}
