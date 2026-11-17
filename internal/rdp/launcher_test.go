package rdp

import (
	"strings"
	"testing"
)

func TestBuildRDPFile(t *testing.T) {
	p := RDPProfile{Host: "h", Username: "u\r\nfull address:s:evil", Options: DefaultOptions()}
	out := buildRDPFile(p, true)
	if !strings.Contains(out, "screen mode id:i:1\r\n") {
		t.Errorf("windowed profile must use screen mode 1:\n%s", out)
	}
	if strings.Count(out, "\r\nfull address:s:")+b2i(strings.HasPrefix(out, "full address:s:")) != 1 {
		t.Errorf("value injected an extra line:\n%s", out)
	}
	if !strings.Contains(out, "redirectprinters:i:0") || !strings.Contains(out, "redirectdrives:i:0") {
		t.Errorf("redirection should be off by default:\n%s", out)
	}

	p.Fullscreen = true
	p.Options.Printers = true
	p.Options.Drives = true
	p.Options.DrivePaths = []string{`C:\Share`, `D:\x;y`}
	p.Options.Camera = true
	out = buildRDPFile(p, true)
	for _, want := range []string{
		"screen mode id:i:2", "redirectprinters:i:1", "redirectdrives:i:1",
		`drivestoredirect:s:C:\Share;D:\xy;`, "camerastoredirect:s:*",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(buildRDPFile(p, false), "camerastoredirect") {
		t.Error("windows-only keys leaked into the macOS file")
	}
}
