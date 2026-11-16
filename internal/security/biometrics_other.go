//go:build !windows && !(darwin && cgo)

package security

func biometrics() BiometricInfo {
	return BiometricInfo{Reason: "Biometric unlock is available on Windows and macOS only."}
}

func verifyUser(string, uintptr) error { return ErrBiometricsUnavailable }
