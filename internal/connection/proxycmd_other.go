//go:build !windows

package connection

import "os/exec"

func hideWindow(*exec.Cmd) {}

func setRawCmdLine(cmd *exec.Cmd, args string) { cmd.Args = append(cmd.Args, args) }
