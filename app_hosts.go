package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"terminyxx/internal/inventory"
	"terminyxx/internal/sshconfig"
	"terminyxx/internal/store"
)

// Host metadata: favorites, tags, notes and recent use.

func (a *App) ListHostMeta() ([]store.HostMeta, error) {
	if err := a.guard(); err != nil {
		return nil, err
	}
	if a.data == nil {
		return []store.HostMeta{}, nil
	}
	return a.data.ListHostMeta()
}

func (a *App) SaveHostMeta(m store.HostMeta) error {
	if err := a.guard(); err != nil {
		return err
	}
	if a.data == nil {
		return errors.New("storage unavailable")
	}
	return a.data.SaveHostMeta(m)
}

// TouchHost records that a saved host was opened (for the Recent list).
func (a *App) TouchHost(kind, id string) error {
	if err := a.guard(); err != nil {
		return err
	}
	if a.data == nil {
		return nil
	}
	return a.data.TouchHost(kind, id)
}

// Availability: a TCP connect to each host's port.

// PingTarget is one host to probe; Key comes back in the result.
type PingTarget struct {
	Key  string `json:"key"`
	Host string `json:"host"`
	Port int    `json:"port"`
}

type PingResult struct {
	Key string `json:"key"`
	Up  bool   `json:"up"`
	// Ms is the connect time, -1 when the host did not answer.
	Ms int `json:"ms"`
}

const (
	maxPingTargets = 512
	pingTimeout    = 3 * time.Second
)

// PingHosts tries a TCP connection to every target at once (16 at a time)
// and reports which answered. Nothing is sent over the connections.
func (a *App) PingHosts(targets []PingTarget) ([]PingResult, error) {
	if err := a.guard(); err != nil {
		return nil, err
	}
	if len(targets) > maxPingTargets {
		targets = targets[:maxPingTargets]
	}
	out := make([]PingResult, len(targets))
	sem := make(chan struct{}, 16)
	var wg sync.WaitGroup
	for i, t := range targets {
		out[i] = PingResult{Key: t.Key, Ms: -1}
		if t.Host == "" || t.Port <= 0 || t.Port > 65535 {
			continue
		}
		wg.Add(1)
		go func(i int, t PingTarget) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			start := time.Now()
			c, err := net.DialTimeout("tcp", net.JoinHostPort(t.Host, strconv.Itoa(t.Port)), pingTimeout)
			if err == nil {
				c.Close()
				out[i].Up = true
				out[i].Ms = int(time.Since(start).Milliseconds())
			}
		}(i, t)
	}
	wg.Wait()
	return out, nil
}

// ssh config export.

// ExportSSHConfig writes the given SSH hosts (and the jump hosts they need)
// to a file in ~/.ssh/config format chosen in a save dialog. It returns the
// path, or "" if the user cancelled.
func (a *App) ExportSSHConfig(ids []string) (string, error) {
	if err := a.guard(); err != nil {
		return "", err
	}
	if a.data == nil {
		return "", errors.New("storage unavailable")
	}
	text, n, err := a.buildSSHConfig(ids)
	if err != nil {
		return "", err
	}
	if n == 0 {
		return "", errors.New("no SSH hosts to export")
	}
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Export to ssh config",
		DefaultFilename: "config",
		Filters:         []runtime.FileFilter{{DisplayName: "SSH config", Pattern: "config;*.conf;*.txt"}},
	})
	if err != nil || path == "" {
		return "", err
	}
	if err := os.WriteFile(path, []byte(text), 0o600); err != nil {
		return "", err
	}
	return path, nil
}

func (a *App) buildSSHConfig(ids []string) (string, int, error) {
	var hosts []sshconfig.ExportHost
	seen := map[string]bool{}
	var add func(id string, depth int) error
	add = func(id string, depth int) error {
		if seen[id] || depth > 6 {
			return nil
		}
		seen[id] = true
		p, err := a.data.GetSSHProfile(id)
		if err != nil {
			return nil // not an SSH host
		}
		// Jump hosts first, so the file reads top-down.
		if p.JumpProfileID != "" {
			if err := add(p.JumpProfileID, depth+1); err != nil {
				return err
			}
		}
		h := sshconfig.ExportHost{
			ID: p.ID, Name: p.Name, HostName: p.Host, User: p.Username, Port: p.Port,
			JumpID: p.JumpProfileID, ForwardAgent: p.AgentForwarding, ForwardX11: p.X11Forwarding,
		}
		if p.AuthType == "key" && p.KeyPath != "" {
			h.IdentityFile = p.KeyPath
		}
		switch p.Proxy.Type {
		case "command":
			h.ProxyCommand = p.Proxy.Command
		case "socks5":
			h.ProxyCommand = fmt.Sprintf("nc -X 5 -x %s %%h %%p", net.JoinHostPort(p.Proxy.Host, strconv.Itoa(p.Proxy.Port)))
		case "http":
			h.ProxyCommand = fmt.Sprintf("nc -X connect -x %s %%h %%p", net.JoinHostPort(p.Proxy.Host, strconv.Itoa(p.Proxy.Port)))
		}
		for _, t := range p.Tunnels {
			bind := strconv.Itoa(t.BindPort)
			if t.BindHost != "" {
				bind = net.JoinHostPort(t.BindHost, bind)
			}
			dest := net.JoinHostPort(t.DestHost, strconv.Itoa(t.DestPort))
			switch t.Kind {
			case "local":
				h.LocalForwards = append(h.LocalForwards, bind+" "+dest)
			case "remote":
				h.RemoteForwards = append(h.RemoteForwards, bind+" "+dest)
			case "dynamic":
				h.DynamicForwards = append(h.DynamicForwards, bind)
			}
		}
		hosts = append(hosts, h)
		return nil
	}
	for _, id := range ids {
		if err := add(id, 0); err != nil {
			return "", 0, err
		}
	}
	header := "Exported by Terminyxx on " + time.Now().Format("2006-01-02 15:04") + ".\nPasswords are not exported."
	return sshconfig.Export(hosts, header), len(hosts), nil
}

// Cloud and hypervisor inventories.

func (a *App) ListInventories() ([]store.Inventory, error) {
	if err := a.guard(); err != nil {
		return nil, err
	}
	if a.data == nil {
		return []store.Inventory{}, nil
	}
	return a.data.ListInventories()
}

func (a *App) SaveInventory(inv store.Inventory) error {
	if err := a.guard(); err != nil {
		return err
	}
	if a.data == nil {
		return errors.New("storage unavailable")
	}
	inv.Config.Regions = cleanRegions(inv.Config.Regions)
	return a.data.SaveInventory(inv)
}

func (a *App) DeleteInventory(id string) error {
	if err := a.guard(); err != nil {
		return err
	}
	if a.data == nil {
		return errors.New("storage unavailable")
	}
	return a.data.DeleteInventory(id)
}

// SyncInventory reads the account's machines and mirrors them into its
// folder. An untrusted Proxmox certificate fails with
// "INVCERT_UNKNOWN|<sha256>|<subject>"; the UI saves the fingerprint into the
// inventory's config once the user accepts it and calls again.
func (a *App) SyncInventory(id string) (store.InventorySync, error) {
	if err := a.guard(); err != nil {
		return store.InventorySync{}, err
	}
	if a.data == nil {
		return store.InventorySync{}, errors.New("storage unavailable")
	}
	inv, err := a.data.GetInventory(id)
	if err != nil {
		return store.InventorySync{}, err
	}
	secret, err := a.data.InventorySecret(id)
	if err != nil {
		return store.InventorySync{}, err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 2*time.Minute)
	defer cancel()
	list, err := inventory.Fetch(ctx, inv.Kind, inv.Config, secret)
	if err != nil {
		return store.InventorySync{}, err
	}
	return a.data.ApplyInventory(id, list)
}

func cleanRegions(in []string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, r := range in {
		for _, part := range strings.FieldsFunc(r, func(c rune) bool { return c == ',' || c == ' ' || c == '\n' }) {
			part = strings.ToLower(strings.TrimSpace(part))
			if part != "" && !seen[part] {
				seen[part] = true
				out = append(out, part)
			}
		}
	}
	return out
}
