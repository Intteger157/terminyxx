//go:build !windows && !darwin

package rdp

import "fmt"

type platformLauncher struct{}

func newPlatformLauncher() Launcher {
	return &platformLauncher{}
}

func (l *platformLauncher) Launch(profile RDPProfile) error {
	return fmt.Errorf("RDP launch is not supported on this platform")
}
