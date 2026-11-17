//go:build darwin

package rdp

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

type platformLauncher struct{}

func newPlatformLauncher() Launcher {
	return &platformLauncher{}
}

// Launch opens the profile in Microsoft Remote Desktop. The client has no way
// to receive a password through the file, so it is ignored here.
func (l *platformLauncher) Launch(profile RDPProfile, _ string) error {
	filePath := filepath.Join(os.TempDir(), fmt.Sprintf("terminyxx-%s.rdp", profile.ID))
	if err := os.WriteFile(filePath, []byte(buildRDPFile(profile, false)), 0o600); err != nil {
		return fmt.Errorf("write rdp file: %w", err)
	}
	if err := exec.Command("open", filePath).Start(); err != nil {
		_ = os.Remove(filePath)
		return err
	}
	// The client imports the file asynchronously; remove it afterwards.
	time.AfterFunc(30*time.Second, func() { _ = os.Remove(filePath) })
	return nil
}
