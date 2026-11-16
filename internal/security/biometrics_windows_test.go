//go:build windows

package security

import (
	"runtime"
	"strings"
	"testing"
	"unsafe"
)

// The IID published for IAsyncOperation<UserConsentVerificationResult>
// (e.g. in the Windows SDK's generated headers).
func TestPinterfaceIID(t *testing.T) {
	got := iidAsyncOpVerificationResult.String()
	if !strings.EqualFold(got, "{FD596FFD-2318-558F-9DBE-D21DF43764A5}") {
		t.Fatalf("computed IID %s", got)
	}
}

// Activates the UserConsentVerifier interop factory without showing the
// prompt, to check the COM plumbing on this machine.
func TestHelloFactory(t *testing.T) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	procRoInitialize.Call(1)
	class, err := newHString(verifierClass)
	if err != nil {
		t.Fatal(err)
	}
	defer deleteHString(class)
	var factory *comObject
	hr, _, _ := procRoGetActivationFactory.Call(class, uintptr(unsafe.Pointer(&iidUserConsentVerifierInterop)), uintptr(unsafe.Pointer(&factory)))
	if failed(hr) {
		t.Skipf("factory unavailable: %v", hrError("RoGetActivationFactory", hr))
	}
	factory.release()
}
