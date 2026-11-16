//go:build darwin && cgo

package security

/*
#cgo CFLAGS: -x objective-c -fobjc-arc
#cgo LDFLAGS: -framework Foundation -framework LocalAuthentication
#include <stdlib.h>
#import <Foundation/Foundation.h>
#import <LocalAuthentication/LocalAuthentication.h>

// Returns 1 when Touch ID can be used; otherwise 0 and the LAError code.
static int tyxCanUseBiometrics(int *code) {
	LAContext *ctx = [[LAContext alloc] init];
	NSError *err = nil;
	BOOL ok = [ctx canEvaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics error:&err];
	*code = err ? (int)err.code : 0;
	return ok ? 1 : 0;
}

// Shows the Touch ID prompt and blocks until it is answered. Returns 0 on
// success or the LAError code. Must not run on the main thread.
static int tyxVerifyBiometrics(const char *reason) {
	__block int result = -1;
	dispatch_semaphore_t done = dispatch_semaphore_create(0);
	LAContext *ctx = [[LAContext alloc] init];
	ctx.localizedFallbackTitle = @""; // hide "Enter Password": the app has its own
	[ctx evaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics
	    localizedReason:[NSString stringWithUTF8String:reason]
	              reply:^(BOOL success, NSError *error) {
		result = success ? 0 : (int)error.code;
		dispatch_semaphore_signal(done);
	}];
	dispatch_semaphore_wait(done, DISPATCH_TIME_FOREVER);
	return result;
}
*/
import "C"

import (
	"fmt"
	"unsafe"
)

// LAError codes.
const (
	laUserCancel      = -2
	laUserFallback    = -3
	laSystemCancel    = -4
	laAppCancel       = -9
	laNotAvailable    = -6
	laNotEnrolled     = -7
	laBiometryLockout = -8
)

func biometrics() BiometricInfo {
	var code C.int
	if C.tyxCanUseBiometrics(&code) == 1 {
		return BiometricInfo{Available: true, Kind: "Touch ID"}
	}
	reason := "Touch ID isn't available on this Mac."
	switch int(code) {
	case laNotEnrolled:
		reason = "No fingerprints are enrolled in Touch ID."
	case laBiometryLockout:
		reason = "Touch ID is locked out; unlock your Mac with its password first."
	}
	return BiometricInfo{Kind: "Touch ID", Reason: reason}
}

func verifyUser(reason string, _ uintptr) error {
	cs := C.CString(reason)
	defer C.free(unsafe.Pointer(cs))
	switch code := int(C.tyxVerifyBiometrics(cs)); code {
	case 0:
		return nil
	case laUserCancel, laUserFallback, laSystemCancel, laAppCancel:
		return ErrBiometricsCanceled
	case laNotAvailable, laNotEnrolled, laBiometryLockout:
		return ErrBiometricsUnavailable
	default:
		return fmt.Errorf("Touch ID failed (code %d)", code)
	}
}
