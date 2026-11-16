//go:build windows

package capture

import (
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

const consentStore = `Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\`

// Windows 11 logs apps that capture the screen (Windows.Graphics.Capture)
// under these capabilities, like it does for the microphone and camera.
var captureCaps = []string{"graphicsCaptureProgrammatic", "graphicsCaptureWithoutBorder"}

func detectSharing() SharingState {
	var usages []captureUsage
	for _, c := range captureCaps {
		usages = readUsages(consentStore+c, false, usages)
	}
	apps := activeCaptures(usages, runningExes())
	return SharingState{Supported: true, Active: len(apps) > 0, Apps: apps}
}

func readUsages(path string, nonPackaged bool, out []captureUsage) []captureUsage {
	k, err := registry.OpenKey(registry.CURRENT_USER, path, registry.ENUMERATE_SUB_KEYS)
	if err != nil {
		return out
	}
	names, _ := k.ReadSubKeyNames(-1)
	k.Close()
	for _, n := range names {
		if !nonPackaged && n == "NonPackaged" {
			out = readUsages(path+`\NonPackaged`, true, out)
			continue
		}
		sk, err := registry.OpenKey(registry.CURRENT_USER, path+`\`+n, registry.QUERY_VALUE)
		if err != nil {
			continue
		}
		start, _, _ := sk.GetIntegerValue("LastUsedTimeStart")
		stop, _, _ := sk.GetIntegerValue("LastUsedTimeStop")
		sk.Close()
		out = append(out, captureUsage{name: n, nonPackaged: nonPackaged, start: start, stop: stop})
	}
	return out
}

// runningExes returns the lower-cased exe names of all running processes.
func runningExes() map[string]bool {
	m := map[string]bool{}
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return m
	}
	defer windows.CloseHandle(snap)
	var e windows.ProcessEntry32
	e.Size = uint32(unsafe.Sizeof(e))
	for err = windows.Process32First(snap, &e); err == nil; err = windows.Process32Next(snap, &e) {
		m[strings.ToLower(windows.UTF16ToString(e.ExeFile[:]))] = true
	}
	return m
}
