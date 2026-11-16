package security

import "errors"

// BiometricInfo describes the OS's user verification for the UI.
type BiometricInfo struct {
	Available bool `json:"available"`
	// Kind is the name to show: "Touch ID" or "Windows Hello".
	Kind string `json:"kind"`
	// Reason explains why it isn't available.
	Reason string `json:"reason"`
}

var (
	ErrBiometricsUnavailable = errors.New("biometric unlock isn't available on this system")
	ErrBiometricsCanceled    = errors.New("verification was canceled")
)

// Biometrics returns what this system offers. VerifyUser shows the OS
// prompt (Touch ID / Windows Hello) and returns nil once the user passed it.
// Both are implemented per OS in biometrics_*.go.
func Biometrics() BiometricInfo { return biometrics() }

// VerifyUser asks the OS to verify the current user. window is the native
// handle of the window to attach the prompt to (Windows), or 0.
func VerifyUser(reason string, window uintptr) error { return verifyUser(reason, window) }
