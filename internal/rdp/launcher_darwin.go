//go:build darwin

package rdp

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type platformLauncher struct{}

func newPlatformLauncher() Launcher {
	return &platformLauncher{}
}

func (l *platformLauncher) Launch(profile RDPProfile) error {
	rdpContent := buildRDPFile(profile)
	tmpDir := os.TempDir()
	filePath := filepath.Join(tmpDir, fmt.Sprintf("terminyxx-%s.rdp", profile.ID))
	if err := os.WriteFile(filePath, []byte(rdpContent), 0o600); err != nil {
		return fmt.Errorf("write rdp file: %w", err)
	}

	// Microsoft Remote Desktop on macOS opens .rdp files
	return exec.Command("open", filePath).Start()
}

func buildRDPFile(profile RDPProfile) string {
	port := profile.Port
	if port == 0 {
		port = 3389
	}

	lines := []string{
		"screen mode id:i:2",
		fmt.Sprintf("desktopwidth:i:%d", defaultInt(profile.Width, 1920)),
		fmt.Sprintf("desktopheight:i:%d", defaultInt(profile.Height, 1080)),
		"session bpp:i:32",
		fmt.Sprintf("full address:s:%s:%d", profile.Host, port),
		fmt.Sprintf("username:s:%s", profile.Username),
		"authentication level:i:0",
		"prompt for credentials:i:0",
		"negotiate security layer:i:1",
		"redirectclipboard:i:1",
		"redirectprinters:i:0",
		"redirectcomports:i:0",
		"redirectsmartcards:i:0",
		"redirectdrives:i:0",
	}

	if profile.Domain != "" {
		lines = append(lines, fmt.Sprintf("domain:s:%s", profile.Domain))
	}
	if profile.Fullscreen {
		lines = append(lines, "screen mode id:i:2")
	}

	return strings.Join(lines, "\r\n") + "\r\n"
}

func defaultInt(value, fallback int) int {
	if value == 0 {
		return fallback
	}
	return value
}
