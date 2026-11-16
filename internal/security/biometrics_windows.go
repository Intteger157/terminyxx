//go:build windows

package security

import (
	"crypto/sha1"
	"encoding/binary"
	"errors"
	"fmt"
	"runtime"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Windows Hello through the WinRT UserConsentVerifier, called as raw COM so
// the app needs no CGO. Desktop apps must use IUserConsentVerifierInterop
// (RequestVerificationForWindowAsync) so the prompt is owned by our window
// instead of popping up behind it.

var (
	combase                    = windows.NewLazySystemDLL("combase.dll")
	procRoInitialize           = combase.NewProc("RoInitialize")
	procRoGetActivationFactory = combase.NewProc("RoGetActivationFactory")
	procWindowsCreateString    = combase.NewProc("WindowsCreateString")
	procWindowsDeleteString    = combase.NewProc("WindowsDeleteString")

	user32                       = windows.NewLazySystemDLL("user32.dll")
	procEnumWindows              = user32.NewProc("EnumWindows")
	procGetWindowThreadProcessId = user32.NewProc("GetWindowThreadProcessId")
	procIsWindowVisible          = user32.NewProc("IsWindowVisible")
)

const verifierClass = "Windows.Security.Credentials.UI.UserConsentVerifier"

var (
	iidUserConsentVerifierInterop = windows.GUID{Data1: 0x39E050C3, Data2: 0x4E74, Data3: 0x441A, Data4: [8]byte{0x8D, 0xC0, 0xB8, 0x11, 0x04, 0xDF, 0x94, 0x9C}}
	iidAsyncInfo                  = windows.GUID{Data1: 0x00000036, Data2: 0x0000, Data3: 0x0000, Data4: [8]byte{0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}}
	// IAsyncOperation<UserConsentVerificationResult>, derived from its
	// WinRT type signature the same way the MIDL compiler does.
	iidAsyncOpVerificationResult = pinterfaceIID("pinterface({9fc2b0bb-e446-44e2-aa61-9cab8f636af2};enum(Windows.Security.Credentials.UI.UserConsentVerificationResult;i4))")
)

// UserConsentVerificationResult values.
const (
	ucvVerified             = 0
	ucvDeviceNotPresent     = 1
	ucvNotConfiguredForUser = 2
	ucvDisabledByPolicy     = 3
	ucvDeviceBusy           = 4
	ucvRetriesExhausted     = 5
	ucvCanceled             = 6
)

// AsyncStatus values.
const (
	asyncStarted   = 0
	asyncCompleted = 1
	asyncCanceled  = 2
	asyncError     = 3
)

// pinterfaceIID computes the IID of a parameterized WinRT interface: a
// version 5 UUID (SHA-1) of the signature in the WinRT namespace.
func pinterfaceIID(signature string) windows.GUID {
	ns := []byte{0x11, 0xf4, 0x7a, 0xd5, 0x7b, 0x73, 0x42, 0xc0, 0xab, 0xae, 0x87, 0x8b, 0x1e, 0x16, 0xad, 0xee}
	h := sha1.New()
	h.Write(ns)
	h.Write([]byte(signature))
	sum := h.Sum(nil)
	sum[6] = sum[6]&0x0f | 0x50
	sum[8] = sum[8]&0x3f | 0x80
	var g windows.GUID
	g.Data1 = binary.BigEndian.Uint32(sum[0:4])
	g.Data2 = binary.BigEndian.Uint16(sum[4:6])
	g.Data3 = binary.BigEndian.Uint16(sum[6:8])
	copy(g.Data4[:], sum[8:16])
	return g
}

type comObject struct{ vtbl *[64]uintptr }

func (o *comObject) call(index int, args ...uintptr) uintptr {
	all := append([]uintptr{uintptr(unsafe.Pointer(o))}, args...)
	r, _, _ := syscall.SyscallN(o.vtbl[index], all...)
	return r
}

func (o *comObject) release() { o.call(2) }

func (o *comObject) queryInterface(iid *windows.GUID) (*comObject, error) {
	var out *comObject
	if hr := o.call(0, uintptr(unsafe.Pointer(iid)), uintptr(unsafe.Pointer(&out))); failed(hr) {
		return nil, hrError("QueryInterface", hr)
	}
	return out, nil
}

func failed(hr uintptr) bool { return int32(hr) < 0 }

func hrError(what string, hr uintptr) error {
	return fmt.Errorf("%s failed: 0x%08X", what, uint32(hr))
}

func newHString(s string) (uintptr, error) {
	u, err := windows.UTF16FromString(s)
	if err != nil {
		return 0, err
	}
	var hs uintptr
	hr, _, _ := procWindowsCreateString.Call(uintptr(unsafe.Pointer(&u[0])), uintptr(len(u)-1), uintptr(unsafe.Pointer(&hs)))
	if failed(hr) {
		return 0, hrError("WindowsCreateString", hr)
	}
	return hs, nil
}

func deleteHString(hs uintptr) {
	if hs != 0 {
		procWindowsDeleteString.Call(hs)
	}
}

func biometrics() BiometricInfo {
	if err := combase.Load(); err != nil {
		return BiometricInfo{Kind: "Windows Hello", Reason: "Windows Hello needs Windows 10 or later."}
	}
	// Whether Hello is set up is only known when it is asked; the UI checks
	// that by running a verification when the option is turned on.
	return BiometricInfo{Available: true, Kind: "Windows Hello"}
}

func verifyUser(reason string, window uintptr) error {
	if err := combase.Load(); err != nil {
		return ErrBiometricsUnavailable
	}
	if window == 0 {
		window = mainWindow()
	}
	// COM state is per thread.
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	procRoInitialize.Call(1) // RO_INIT_MULTITHREADED; S_FALSE / RPC_E_CHANGED_MODE are fine

	class, err := newHString(verifierClass)
	if err != nil {
		return err
	}
	defer deleteHString(class)
	var factory *comObject
	hr, _, _ := procRoGetActivationFactory.Call(class, uintptr(unsafe.Pointer(&iidUserConsentVerifierInterop)), uintptr(unsafe.Pointer(&factory)))
	if failed(hr) {
		return fmt.Errorf("%w (%v)", ErrBiometricsUnavailable, hrError("RoGetActivationFactory", hr))
	}
	defer factory.release()

	msg, err := newHString(reason)
	if err != nil {
		return err
	}
	defer deleteHString(msg)

	// IUserConsentVerifierInterop::RequestVerificationForWindowAsync is the
	// first method after IInspectable's six.
	var op *comObject
	if hr := factory.call(6, window, msg, uintptr(unsafe.Pointer(&iidAsyncOpVerificationResult)), uintptr(unsafe.Pointer(&op))); failed(hr) {
		return fmt.Errorf("%w (%v)", ErrBiometricsUnavailable, hrError("RequestVerificationForWindowAsync", hr))
	}
	defer op.release()

	info, err := op.queryInterface(&iidAsyncInfo)
	if err != nil {
		return err
	}
	defer info.release()

	// Poll IAsyncInfo::get_Status (index 7) instead of registering a
	// completion handler, which would need a COM object implemented in Go.
	deadline := time.Now().Add(5 * time.Minute)
	for {
		var status int32
		if hr := info.call(7, uintptr(unsafe.Pointer(&status))); failed(hr) {
			return hrError("IAsyncInfo.Status", hr)
		}
		switch status {
		case asyncStarted:
			if time.Now().After(deadline) {
				info.call(9) // Cancel
				return ErrBiometricsCanceled
			}
			time.Sleep(50 * time.Millisecond)
			continue
		case asyncCompleted:
		case asyncCanceled:
			return ErrBiometricsCanceled
		default:
			var code int32
			info.call(8, uintptr(unsafe.Pointer(&code))) // get_ErrorCode
			return hrError("Windows Hello", uintptr(uint32(code)))
		}
		break
	}

	// IAsyncOperation<T>::GetResults (index 8).
	var result int32
	if hr := op.call(8, uintptr(unsafe.Pointer(&result))); failed(hr) {
		return hrError("GetResults", hr)
	}
	switch result {
	case ucvVerified:
		return nil
	case ucvCanceled:
		return ErrBiometricsCanceled
	case ucvDeviceNotPresent, ucvNotConfiguredForUser:
		return errors.New("Windows Hello isn't set up for this account (Settings → Accounts → Sign-in options)")
	case ucvDisabledByPolicy:
		return errors.New("Windows Hello is disabled by policy")
	case ucvDeviceBusy:
		return errors.New("Windows Hello is busy, try again")
	case ucvRetriesExhausted:
		return errors.New("too many failed Windows Hello attempts")
	default:
		return fmt.Errorf("Windows Hello returned %d", result)
	}
}

// mainWindow finds a visible top-level window of this process.
func mainWindow() uintptr {
	pid := uint32(windows.GetCurrentProcessId())
	var found uintptr
	cb := syscall.NewCallback(func(hwnd, _ uintptr) uintptr {
		var owner uint32
		procGetWindowThreadProcessId.Call(hwnd, uintptr(unsafe.Pointer(&owner)))
		if owner == pid {
			if v, _, _ := procIsWindowVisible.Call(hwnd); v != 0 {
				found = hwnd
				return 0
			}
		}
		return 1
	})
	procEnumWindows.Call(cb, 0)
	return found
}
