//go:build windows

package filesink

import "golang.org/x/sys/windows"

// Open opens path with its default application (or a folder in Explorer).
func Open(path string) error {
	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return err
	}
	verb, _ := windows.UTF16PtrFromString("open")
	return windows.ShellExecute(0, verb, p, nil, nil, windows.SW_SHOWNORMAL)
}
