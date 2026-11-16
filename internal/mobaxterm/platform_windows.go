//go:build windows

package mobaxterm

import (
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

func ansiCodePage() uint32 { return windows.GetACP() }

// lastIniPath is where the installed MobaXterm says its config lives.
func lastIniPath() string {
	k, err := registry.OpenKey(registry.CURRENT_USER, `Software\Mobatek\MobaXterm`, registry.QUERY_VALUE)
	if err != nil {
		return ""
	}
	defer k.Close()
	v, _, err := k.GetStringValue("LastIniPath")
	if err != nil {
		return ""
	}
	return v
}
