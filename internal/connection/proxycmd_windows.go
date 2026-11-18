//go:build windows

package connection

import (
	"os/exec"
	"syscall"
)

const createNoWindow = 0x08000000

// hideWindow keeps a ProxyCommand from flashing a console window.
func hideWindow(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.HideWindow = true
	cmd.SysProcAttr.CreationFlags |= createNoWindow
}

// setRawCmdLine passes cmd.exe's arguments unquoted: cmd has its own
// quoting rules and Go's escaping would break commands with quotes.
func setRawCmdLine(cmd *exec.Cmd, args string) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.CmdLine = `cmd.exe ` + args
}
