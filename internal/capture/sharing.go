package capture

import (
	"path"
	"sort"
	"strings"
)

// SharingState says whether something is capturing the screen right now.
type SharingState struct {
	// Supported is false where the OS gives no way to tell (macOS, Linux).
	Supported bool `json:"supported"`
	// Active is true while screen sharing or recording is detected.
	Active bool `json:"active"`
	// Apps names the programs that are capturing, for display.
	Apps []string `json:"apps"`
}

// DetectSharing checks whether another app is capturing the screen.
func DetectSharing() SharingState {
	return detectSharing()
}

// captureUsage is one app's entry in Windows' capability usage records.
type captureUsage struct {
	name        string // packaged family name, or an exe path with '#' for '\'
	nonPackaged bool
	start, stop uint64
}

// helperProcs are processes that capture the screen the whole time they run.
// Zoom starts CptHost.exe only while sharing. Streaming and recording apps
// such as OBS capture through DXGI Desktop Duplication (Display Capture),
// which Windows doesn't log in the ConsentStore, so they're treated as
// capturing while they're open (their preview is a live capture too).
var helperProcs = map[string]string{
	"cpthost.exe":            "Zoom",
	"obs64.exe":              "OBS",
	"obs32.exe":              "OBS",
	"streamlabs obs.exe":     "Streamlabs",
	"streamlabs desktop.exe": "Streamlabs",
	"xsplit.core.exe":        "XSplit",
	"camrecorder.exe":        "Camtasia",
}

// activeCaptures returns the apps from usage records that are capturing now.
// Windows sets LastUsedTimeStop to 0 while capture is in progress; an entry
// left that way by a crashed app is ignored when its exe isn't running.
func activeCaptures(usages []captureUsage, running map[string]bool) []string {
	seen := map[string]bool{}
	var apps []string
	add := func(a string) {
		if !seen[a] {
			seen[a] = true
			apps = append(apps, a)
		}
	}
	for _, u := range usages {
		if u.start == 0 || u.stop != 0 {
			continue
		}
		if u.nonPackaged {
			exe := strings.ToLower(path.Base(strings.ReplaceAll(u.name, "#", "/")))
			if !running[exe] {
				continue
			}
			add(strings.TrimSuffix(exe, ".exe"))
		} else {
			name := u.name
			if i := strings.LastIndex(name, "_"); i > 0 {
				name = name[:i]
			}
			if i := strings.LastIndex(name, "."); i >= 0 {
				name = name[i+1:]
			}
			add(name)
		}
	}
	for proc, app := range helperProcs {
		if running[proc] {
			add(app)
		}
	}
	sort.Strings(apps)
	return apps
}
