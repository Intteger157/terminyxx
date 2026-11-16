package connection

import (
	"io"
	"net"
	"os"
	"runtime"
	"strings"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
)

const windowsAgentPipe = `\\.\pipe\openssh-ssh-agent`

// dialAgent connects to a running ssh-agent: $SSH_AUTH_SOCK, or on Windows
// the OpenSSH agent's named pipe. Returns nil if no agent is reachable.
func dialAgent() io.ReadWriteCloser {
	sock := os.Getenv("SSH_AUTH_SOCK")
	if runtime.GOOS == "windows" {
		if sock == "" || strings.HasPrefix(sock, `\\.\pipe\`) {
			if sock == "" {
				sock = windowsAgentPipe
			}
			// Named pipes open like files on Windows.
			f, err := os.OpenFile(sock, os.O_RDWR, 0)
			if err != nil {
				return nil
			}
			return f
		}
	}
	if sock == "" {
		return nil
	}
	conn, err := net.Dial("unix", sock)
	if err != nil {
		return nil
	}
	return conn
}

// agentAuth returns an auth method backed by the agent plus a closer that
// must run after the handshake, or (nil, nil) without an agent.
func agentAuth() (ssh.AuthMethod, func()) {
	conn := dialAgent()
	if conn == nil {
		return nil, func() {}
	}
	client := agent.NewClient(conn)
	if keys, err := client.List(); err != nil || len(keys) == 0 {
		conn.Close()
		return nil, func() {}
	}
	return ssh.PublicKeysCallback(client.Signers), func() { conn.Close() }
}
