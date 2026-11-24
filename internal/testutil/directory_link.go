package testutil

import (
	"os"
	"os/exec"
	"runtime"
	"testing"
)

// DirectoryLink creates a link for filesystem containment tests. On Windows
// a junction provides the same check without requiring symlink privileges.
func DirectoryLink(t *testing.T, target, name string) {
	t.Helper()
	if err := os.Symlink(target, name); err == nil {
		return
	} else if runtime.GOOS != "windows" {
		t.Fatal(err)
	}
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
		`New-Item -ItemType Junction -Path $env:TERMINYXX_TEST_LINK -Target $env:TERMINYXX_TEST_TARGET -ErrorAction Stop | Out-Null`)
	cmd.Env = append(os.Environ(), "TERMINYXX_TEST_LINK="+name, "TERMINYXX_TEST_TARGET="+target)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("create directory junction: %v\n%s", err, out)
	}
}
