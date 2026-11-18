package connection

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"io"
	"net"
	"path/filepath"
	"runtime"
	"testing"
	"unsafe"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
	"golang.org/x/sys/windows"
)

var (
	procRegisterClassExW = user32.NewProc("RegisterClassExW")
	procCreateWindowExW  = user32.NewProc("CreateWindowExW")
	procDefWindowProcW   = user32.NewProc("DefWindowProcW")
	procGetMessageW      = user32.NewProc("GetMessageW")
	procDispatchMessageW = user32.NewProc("DispatchMessageW")
	procPostMessageW     = user32.NewProc("PostMessageW")
	procDestroyWindow    = user32.NewProc("DestroyWindow")
	procOpenFileMappingW = windows.NewLazySystemDLL("kernel32.dll").NewProc("OpenFileMappingW")
)

type wndClassEx struct {
	size, style                        uint32
	wndProc                            uintptr
	clsExtra, wndExtra                 int32
	instance, icon, cursor, background uintptr
	menuName, className                *uint16
	iconSm                             uintptr
}

type winMsg struct {
	hwnd           uintptr
	message        uint32
	wParam, lParam uintptr
	time           uint32
	pt             [2]int32
	private        uint32
}

// fakePageant runs a window that answers WM_COPYDATA agent queries the way
// Pageant does, backed by keyring.
func fakePageant(t *testing.T, keyring agent.Agent) {
	cli, srv := net.Pipe()
	go func() { _ = agent.ServeAgent(keyring, srv) }()

	// A class stays registered for the process, with its first window proc.
	class := fmt.Sprintf("TerminyxxTestPageant%d", pageantSeq.Add(1))
	old := pageantClass
	pageantClass = class
	ready := make(chan uintptr)
	go func() {
		runtime.LockOSThread()
		name, _ := windows.UTF16PtrFromString(class)
		proc := windows.NewCallback(func(hwnd, msg, wParam, lParam uintptr) uintptr {
			if msg != wmCopyData {
				r, _, _ := procDefWindowProcW.Call(hwnd, msg, wParam, lParam)
				return r
			}
			cds := (*copyDataStruct)(unsafe.Add(nil, lParam))
			if cds.dwData != pageantCopyDataID {
				return 0
			}
			mapName := unsafe.Slice((*byte)(unsafe.Add(nil, cds.lpData)), cds.cbData-1)
			name16, _ := windows.UTF16PtrFromString(string(mapName))
			h, _, _ := procOpenFileMappingW.Call(windows.FILE_MAP_WRITE|windows.FILE_MAP_READ, 0, uintptr(unsafe.Pointer(name16)))
			if h == 0 {
				return 0
			}
			defer windows.CloseHandle(windows.Handle(h))
			addr, err := windows.MapViewOfFile(windows.Handle(h), windows.FILE_MAP_WRITE, 0, 0, 0)
			if err != nil {
				return 0
			}
			defer windows.UnmapViewOfFile(addr)
			view := unsafe.Slice((*byte)(unsafe.Add(nil, addr)), pageantMaxMsg)
			n := binary.BigEndian.Uint32(view)
			if _, err := cli.Write(view[:4+n]); err != nil {
				return 0
			}
			if _, err := io.ReadFull(cli, view[:4]); err != nil {
				return 0
			}
			if _, err := io.ReadFull(cli, view[4:4+binary.BigEndian.Uint32(view)]); err != nil {
				return 0
			}
			return 1
		})
		wc := wndClassEx{wndProc: proc, className: name}
		wc.size = uint32(unsafe.Sizeof(wc))
		procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))
		hwnd, _, _ := procCreateWindowExW.Call(0, uintptr(unsafe.Pointer(name)), uintptr(unsafe.Pointer(name)), 0, 0, 0, 0, 0, 0, 0, 0, 0)
		ready <- hwnd
		var m winMsg
		for {
			r, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
			if int32(r) <= 0 {
				return
			}
			if m.message == 0x0012 { // WM_QUIT
				return
			}
			procDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
		}
	}()
	hwnd := <-ready
	if hwnd == 0 {
		t.Fatal("could not create the fake Pageant window")
	}
	t.Cleanup(func() {
		pageantClass = old
		procDestroyWindow.Call(hwnd) // only works on its own thread; WM_CLOSE below ends the loop
		procPostMessageW.Call(hwnd, 0x0012, 0, 0)
		cli.Close()
	})
}

func TestPageantAgent(t *testing.T) {
	isolateHome(t)
	t.Setenv("SSH_AUTH_SOCK", "")
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	sshPub, _ := ssh.NewPublicKey(pub)
	keyring := agent.NewKeyring()
	if err := keyring.Add(agent.AddedKey{PrivateKey: priv, Comment: "pageant key"}); err != nil {
		t.Fatal(err)
	}
	fakePageant(t, keyring)
	SetAgentSource(AgentPageant, "")
	t.Cleanup(func() { SetAgentSource(AgentAuto, "") })

	st, err := ListAgentKeys()
	if err != nil || !st.Running || st.Source != "Pageant" || len(st.Keys) != 1 || st.Keys[0].Comment != "pageant key" {
		t.Fatalf("status = %+v, %v", st, err)
	}

	s := newTestServer(t, serverOpts{authorizedKey: sshPub})
	m, _, _ := newManager(t)
	connectTrusted(t, m, ConnectRequest{ID: "pg", Host: s.host, Port: s.port, Username: "u", AuthType: "key"})
}

func TestAgentSourceCustomMissing(t *testing.T) {
	SetAgentSource(AgentCustom, `\\.\pipe\terminyxx-no-such-agent`)
	t.Cleanup(func() { SetAgentSource(AgentAuto, "") })
	if st, err := ListAgentKeys(); err != nil || st.Running {
		t.Fatalf("missing custom agent: %+v %v", st, err)
	}
}

// In auto mode an empty OpenSSH agent must not hide a loaded Pageant.
func TestAutoAgentSkipsEmptyAgent(t *testing.T) {
	isolateHome(t)
	sock := filepath.Join(t.TempDir(), "empty.sock")
	ln, err := net.Listen("unix", sock)
	if err != nil {
		t.Skipf("unix sockets unavailable: %v", err)
	}
	t.Cleanup(func() { ln.Close() })
	empty := agent.NewKeyring()
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func() { _ = agent.ServeAgent(empty, c); c.Close() }()
		}
	}()
	t.Setenv("SSH_AUTH_SOCK", sock)

	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	loaded := agent.NewKeyring()
	_ = loaded.Add(agent.AddedKey{PrivateKey: priv})
	fakePageant(t, loaded)
	SetAgentSource(AgentAuto, "")

	st, err := ListAgentKeys()
	if err != nil || st.Source != "Pageant" || len(st.Keys) != 1 {
		t.Fatalf("auto picked %+v, %v", st, err)
	}
	SetAgentSource(AgentOpenSSH, "")
	t.Cleanup(func() { SetAgentSource(AgentAuto, "") })
	if st, _ := ListAgentKeys(); st.Source != "OpenSSH agent" || len(st.Keys) != 0 {
		t.Fatalf("openssh picked %+v", st)
	}
}
