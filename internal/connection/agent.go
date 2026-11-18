package connection

import (
	"io"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
)

const windowsAgentPipe = `\\.\pipe\openssh-ssh-agent`

// Agent sources (settings.security.ssh.agent).
const (
	AgentAuto    = "auto"    // $SSH_AUTH_SOCK / OpenSSH pipe, 1Password, then Pageant
	AgentOpenSSH = "openssh" // $SSH_AUTH_SOCK, or the OpenSSH pipe on Windows
	AgentPageant = "pageant" // PuTTY's Pageant (Windows)
	AgentCustom  = "custom"  // a socket or named pipe path, e.g. 1Password's
)

var agentSource = struct {
	sync.RWMutex
	kind, path string
}{kind: AgentAuto}

// SetAgentSource picks where keys come from; unknown kinds mean auto.
func SetAgentSource(kind, path string) {
	switch kind {
	case AgentOpenSSH, AgentPageant, AgentCustom:
	default:
		kind = AgentAuto
	}
	agentSource.Lock()
	agentSource.kind, agentSource.path = kind, strings.TrimSpace(path)
	agentSource.Unlock()
}

// agentDialer opens one agent, or returns nil when it isn't running.
type agentDialer struct {
	name string
	dial func() io.ReadWriteCloser
}

// agentDialers lists the agents to try for the current setting, in order.
func agentDialers() []agentDialer {
	agentSource.RLock()
	kind, path := agentSource.kind, agentSource.path
	agentSource.RUnlock()
	openSSH := agentDialer{"OpenSSH agent", func() io.ReadWriteCloser { return dialAgentPath(os.Getenv("SSH_AUTH_SOCK"), true) }}
	pageant := agentDialer{"Pageant", dialPageant}
	switch kind {
	case AgentOpenSSH:
		return []agentDialer{openSSH}
	case AgentPageant:
		return []agentDialer{pageant}
	case AgentCustom:
		return []agentDialer{{"Agent at " + path, func() io.ReadWriteCloser { return dialAgentPath(path, false) }}}
	}
	list := []agentDialer{openSSH}
	if p := onePasswordSocket(); p != "" && os.Getenv("SSH_AUTH_SOCK") == "" {
		list = append(list, agentDialer{"1Password", func() io.ReadWriteCloser { return dialAgentPath(p, false) }})
	}
	if runtime.GOOS == "windows" {
		list = append(list, pageant)
	}
	return list
}

// onePasswordSocket is 1Password's agent socket on macOS and Linux (on
// Windows it serves the OpenSSH pipe, which is tried anyway).
func onePasswordSocket() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	switch runtime.GOOS {
	case "darwin":
		return filepath.Join(home, "Library", "Group Containers", "2BUA8C4S2C.com.1password", "t", "agent.sock")
	case "linux":
		return filepath.Join(home, ".1password", "agent.sock")
	}
	return ""
}

// dialAgentPath opens a unix socket, or a named pipe on Windows. With
// defaultPipe an empty path means the Windows OpenSSH agent's pipe.
func dialAgentPath(sock string, defaultPipe bool) io.ReadWriteCloser {
	if strings.HasPrefix(sock, "~/") || strings.HasPrefix(sock, `~\`) {
		if home, err := os.UserHomeDir(); err == nil {
			sock = filepath.Join(home, sock[2:])
		}
	}
	if runtime.GOOS == "windows" {
		if sock == "" && defaultPipe {
			sock = windowsAgentPipe
		}
		if strings.HasPrefix(sock, `\\.\pipe\`) || strings.HasPrefix(sock, `//./pipe/`) {
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

// openAgent returns the first agent that is running and, when there are
// others left to try, holds at least one key (an empty OpenSSH agent must not
// hide a loaded Pageant). The second value names it.
func openAgent() (io.ReadWriteCloser, string) {
	dialers := agentDialers()
	for i, d := range dialers {
		conn := d.dial()
		if conn == nil {
			continue
		}
		if i == len(dialers)-1 {
			return conn, d.name
		}
		// Without Close the agent client answers in this goroutine instead of
		// starting a reader of its own, which would keep consuming conn.
		probe := struct{ io.ReadWriter }{conn}
		if keys, err := agent.NewClient(probe).List(); err == nil && len(keys) > 0 {
			return conn, d.name
		}
		conn.Close()
	}
	return nil, ""
}

// dialAgent connects to the agent picked in the settings. Returns nil if no
// agent is reachable.
func dialAgent() io.ReadWriteCloser {
	conn, _ := openAgent()
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
