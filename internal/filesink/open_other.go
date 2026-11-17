//go:build !windows

package filesink

import (
	"os/exec"
	"runtime"
)

// Open opens path with its default application (or a folder in the file manager).
func Open(path string) error {
	name := "xdg-open"
	if runtime.GOOS == "darwin" {
		name = "open"
	}
	cmd := exec.Command(name, path)
	if err := cmd.Start(); err != nil {
		return err
	}
	go func() { _ = cmd.Wait() }()
	return nil
}
