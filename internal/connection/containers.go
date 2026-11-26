package connection

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
)

// Container runtimes the picker understands.
const (
	RuntimeDocker  = "docker"
	RuntimePodman  = "podman"
	RuntimeKubectl = "kubectl"
)

// Container is a running container or pod on the server.
type Container struct {
	Runtime   string `json:"runtime"`
	ID        string `json:"id"`        // container id, or pod name
	Name      string `json:"name"`      // shown in the list
	Namespace string `json:"namespace"` // kubectl only
	Image     string `json:"image"`
	Status    string `json:"status"`
}

// safeName accepts what Docker, Podman and Kubernetes allow in ids, names
// and namespaces. Anything else is dropped, because these values come from
// the server and end up in a command line.
var safeName = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,252}$`)

const shellPick = `command -v bash >/dev/null 2>&1 && exec bash || exec sh`

// ShellCommand builds the command for a new interactive container pane.
func (c Container) ShellCommand() (string, error) {
	if !safeName.MatchString(c.ID) {
		return "", errors.New("invalid container ID")
	}
	switch c.Runtime {
	case RuntimeDocker, RuntimePodman:
		return fmt.Sprintf("%s exec -it %s sh -c '%s'", c.Runtime, c.ID, shellPick), nil
	case RuntimeKubectl:
		if !safeName.MatchString(c.Namespace) {
			return "", errors.New("invalid container namespace")
		}
		return fmt.Sprintf("kubectl exec -it -n %s %s -- sh -c '%s'", c.Namespace, c.ID, shellPick), nil
	default:
		return "", fmt.Errorf("unknown runtime %q", c.Runtime)
	}
}

func listCommand(runtime string) (string, error) {
	switch runtime {
	case RuntimeDocker, RuntimePodman:
		return runtime + ` ps --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}' 2>&1`, nil
	case RuntimeKubectl:
		return `kubectl get pods --all-namespaces --no-headers ` +
			`-o custom-columns=NS:.metadata.namespace,NAME:.metadata.name,STATUS:.status.phase 2>&1`, nil
	}
	return "", fmt.Errorf("unknown runtime %q", runtime)
}

// parseContainers turns command output into entries; lines that do not look
// like entries are ignored, but if nothing parses the output is returned as
// the error (e.g. "permission denied while trying to connect to the docker
// daemon socket").
func parseContainers(runtime, out string) ([]Container, error) {
	var list []Container
	for _, line := range strings.Split(strings.ReplaceAll(out, "\r", ""), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		switch runtime {
		case RuntimeDocker, RuntimePodman:
			f := strings.SplitN(line, "|", 4)
			if len(f) != 4 || !safeName.MatchString(f[0]) || !safeName.MatchString(f[1]) {
				continue
			}
			list = append(list, Container{
				Runtime: runtime, ID: f[0], Name: f[1], Image: f[2], Status: f[3],
			})
		case RuntimeKubectl:
			f := strings.Fields(line)
			if len(f) != 3 || !safeName.MatchString(f[0]) || !safeName.MatchString(f[1]) {
				continue
			}
			list = append(list, Container{
				Runtime: runtime, ID: f[1], Name: f[1], Namespace: f[0], Status: f[2],
			})
		}
	}
	if len(list) == 0 {
		msg := strings.TrimSpace(out)
		switch {
		case msg == "":
			return nil, errors.New("no running containers found")
		case len(msg) > 300:
			msg = msg[:300]
		}
		if strings.Contains(msg, "not found") || strings.Contains(msg, "command not found") {
			return nil, fmt.Errorf("%s is not installed on this host", runtime)
		}
		return nil, errors.New(msg)
	}
	return list, nil
}

// ListContainers lists running containers (or pods) on the server of
// connection id, over a separate exec channel.
func (m *ConnectionManager) ListContainers(id, runtime string) ([]Container, error) {
	if m.gate.Locked() {
		return nil, ErrLocked
	}
	cmd, err := listCommand(runtime)
	if err != nil {
		return nil, err
	}
	conn, err := m.get(id)
	if err != nil {
		return nil, err
	}
	client := conn.Client()
	if client == nil {
		return nil, errors.New("not connected")
	}
	out, err := runExec(client, cmd, 15*time.Second)
	if err != nil {
		return nil, err
	}
	return parseContainers(runtime, out)
}
