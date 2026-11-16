//go:build windows

package capture

import (
	"fmt"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	user32                       = windows.NewLazySystemDLL("user32.dll")
	procEnumWindows              = user32.NewProc("EnumWindows")
	procGetWindowThreadProcessId = user32.NewProc("GetWindowThreadProcessId")
	procSetWindowDisplayAffinity = user32.NewProc("SetWindowDisplayAffinity")
)

const (
	wdaNone               = 0x00
	wdaMonitor            = 0x01 // window shows as black in captures
	wdaExcludeFromCapture = 0x11 // window is left out of captures (Windows 10 2004+)
)

// processWindows lists the top-level windows owned by this process.
func processWindows() []uintptr {
	pid := windows.GetCurrentProcessId()
	var hwnds []uintptr
	cb := syscall.NewCallback(func(hwnd, _ uintptr) uintptr {
		var owner uint32
		procGetWindowThreadProcessId.Call(hwnd, uintptr(unsafe.Pointer(&owner)))
		if owner == pid {
			hwnds = append(hwnds, hwnd)
		}
		return 1
	})
	procEnumWindows.Call(cb, 0)
	return hwnds
}

func setAffinity(hwnd uintptr, mode uintptr) error {
	if r, _, err := procSetWindowDisplayAffinity.Call(hwnd, mode); r == 0 {
		return err
	}
	return nil
}

func setProtected(on bool) error {
	hwnds := processWindows()
	if len(hwnds) == 0 {
		return fmt.Errorf("no application window found")
	}
	var lastErr error
	ok := 0
	for _, h := range hwnds {
		var err error
		if !on {
			err = setAffinity(h, wdaNone)
		} else if err = setAffinity(h, wdaExcludeFromCapture); err != nil {
			// Older Windows 10 builds don't know WDA_EXCLUDEFROMCAPTURE;
			// WDA_MONITOR still blanks the window in captures.
			err = setAffinity(h, wdaMonitor)
		}
		if err != nil {
			lastErr = err
		} else {
			ok++
		}
	}
	if ok == 0 {
		return fmt.Errorf("SetWindowDisplayAffinity: %w", lastErr)
	}
	return nil
}
