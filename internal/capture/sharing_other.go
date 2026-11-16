//go:build !windows

package capture

// macOS and Linux offer no public way to tell whether the screen is being shared.
func detectSharing() SharingState {
	return SharingState{}
}
