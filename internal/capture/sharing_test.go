package capture

import (
	"reflect"
	"testing"
)

func TestActiveCaptures(t *testing.T) {
	usages := []captureUsage{
		{name: `C:#Program Files#Google#Chrome#Application#chrome.exe`, nonPackaged: true, start: 10, stop: 0}, // sharing
		{name: `C:#Program Files#obs-studio#bin#64bit#obs64.exe`, nonPackaged: true, start: 10, stop: 20},      // finished
		{name: `C:#Users#x#AppData#Local#Discord#app-1#Discord.exe`, nonPackaged: true, start: 10, stop: 0},    // stale: not running
		{name: `MSTeams_8wekyb3d8bbwe`, start: 5, stop: 0},                                                     // sharing
		{name: `Microsoft.ScreenSketch_8wekyb3d8bbwe`, start: 0, stop: 0},                                      // never used
		{name: `C:#Program Files#Google#Chrome#Application#chrome.exe`, nonPackaged: true, start: 11, stop: 0}, // duplicate
	}
	running := map[string]bool{"chrome.exe": true, "cpthost.exe": true}
	got := activeCaptures(usages, running)
	want := []string{"MSTeams", "Zoom", "chrome"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	// OBS uses Desktop Duplication, which leaves no usage record.
	if got := activeCaptures(nil, map[string]bool{"obs64.exe": true}); !reflect.DeepEqual(got, []string{"OBS"}) {
		t.Fatalf("obs: got %v", got)
	}
	if got := activeCaptures(nil, map[string]bool{}); len(got) != 0 {
		t.Fatalf("idle: got %v", got)
	}
}
