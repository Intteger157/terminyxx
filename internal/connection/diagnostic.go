package connection

import (
	"context"
	"errors"
	"net"
	"syscall"

	"golang.org/x/crypto/ssh"
)

type SSHDiagnostic struct {
	Checks []SSHCheck `json:"checks"`
}

type SSHCheck struct {
	Address string `json:"address"`
	Jump    bool   `json:"jump"`
	Stage   string `json:"stage"`
	Failure string `json:"failure"`
}

// TestSSH dials and authenticates using the same route and policy as Connect.
// It closes all clients and does not open a shell or start forwarding.
func (m *ConnectionManager) TestSSH(req ConnectRequest) SSHDiagnostic {
	var report SSHDiagnostic
	req.AcceptHostKey, req.ReplaceHostKey = "", false
	client, jumps, err := dialSSH(req, m.hostKeys, m.Policy(), &report)
	if err == nil {
		_ = client.Close()
		closeJumpClients(jumps)
	}
	return report
}

func tcpDiagnostic(err error) string {
	var timeout net.Error
	var channel *ssh.OpenChannelError
	switch {
	case errors.Is(err, syscall.ECONNREFUSED):
		return "Connection refused"
	case errors.Is(err, context.DeadlineExceeded), errors.As(err, &timeout) && timeout.Timeout():
		return "Connection timed out"
	case errors.Is(err, syscall.EHOSTUNREACH), errors.Is(err, syscall.ENETUNREACH):
		return "Host or network unreachable"
	case errors.As(err, &channel) && channel.Reason == ssh.Prohibited:
		return "The jump host denied TCP forwarding"
	case errors.As(err, &channel):
		return "The jump host could not open a TCP connection to this address"
	default:
		return "Could not open the connection"
	}
}
