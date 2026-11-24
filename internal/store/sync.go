package store

import (
	"fmt"
	"slices"

	"terminyxx/internal/rdp"
)

// BundleVersion is bumped when the exported shape changes incompatibly.
const BundleVersion = 1

// Bundle is everything that moves between machines: hosts, folders and
// snippets. App settings and the lock password stay local.
type Bundle struct {
	Version  int              `json:"version"`
	Folders  []Folder         `json:"folders"`
	SSH      []SSHProfile     `json:"ssh"`
	RDP      []rdp.RDPProfile `json:"rdp"`
	Snippets []Snippet        `json:"snippets"`
	// Identities appeared after version 1 shipped; older files have none and
	// older apps ignore the field (hosts then keep their own copied login).
	Identities []Identity `json:"identities,omitempty"`
	// Streams (Telnet and serial connections) came later too.
	Streams []StreamProfile `json:"streams,omitempty"`
	// Meta (favorites, tags, notes) came later too.
	Meta []HostMeta `json:"meta,omitempty"`
}

// ImportResult counts what an import added or replaced.
type ImportResult struct {
	Folders    int `json:"folders"`
	Hosts      int `json:"hosts"`
	Snippets   int `json:"snippets"`
	Identities int `json:"identities"`
	// Replaced lists existing hosts whose address, user or jump host the
	// import changed, so the UI can tell the user.
	Replaced []string `json:"replaced"`
	// FlagsReset counts SSH hosts with restricted behaviors from the file.
	FlagsReset int `json:"flagsReset"`
	// RDPRedirectionSkipped counts profiles whose local permissions were kept
	// or reset instead of taking permissions from the file.
	RDPRedirectionSkipped int `json:"rdpRedirectionSkipped"`
}

// ExportBundle collects the data to sync. Saved passwords are included only
// if asked; the bundle is encrypted as a whole before it leaves the app.
func (s *Store) ExportBundle(includePasswords bool) (Bundle, error) {
	b := Bundle{Version: BundleVersion}
	var err error
	if b.Folders, err = s.ListFolders(); err != nil {
		return b, err
	}
	idents, err := s.ListIdentities()
	if err != nil {
		return b, err
	}
	for _, i := range idents {
		i.Password, i.HasPassword, i.ClearPassword, i.Hosts = "", false, false, 0
		if includePasswords {
			if i.Password, err = s.IdentityPassword(i.ID); err != nil {
				return b, err
			}
		}
		b.Identities = append(b.Identities, i)
	}
	ssh, err := s.ListSSHProfiles()
	if err != nil {
		return b, err
	}
	for _, p := range ssh {
		p.Password, p.HasPassword, p.ClearPassword = "", false, false
		if includePasswords {
			pw, err := s.SSHPassword(p.ID)
			if err != nil {
				return b, err
			}
			p.Password = pw
			if p.Proxy.HasPassword {
				p.Proxy.Password, _ = s.ProxyPassword(p.ID)
			}
		}
		p.Proxy.HasPassword, p.Proxy.ClearPassword = false, false
		b.SSH = append(b.SSH, p)
	}
	list, err := s.ListRDPProfiles()
	if err != nil {
		return b, err
	}
	for _, p := range list {
		p.Password, p.HasPassword, p.ClearPassword = "", false, false
		if includePasswords {
			full, err := s.GetRDPProfile(p.ID)
			if err != nil {
				return b, err
			}
			p.Password = full.Password
		}
		b.RDP = append(b.RDP, p)
	}
	if b.Snippets, err = s.ListSnippets(); err != nil {
		return b, err
	}
	if b.Streams, err = s.ListStreamProfiles(); err != nil {
		return b, err
	}
	if b.Meta, err = s.ListHostMeta(); err != nil {
		return b, err
	}
	return b, nil
}

// ImportBundle merges a bundle into the database by ID: items in the bundle
// replace local ones with the same ID, everything else is kept. Nothing is
// ever deleted, so a host removed on another machine stays here.
func (s *Store) ImportBundle(b Bundle) (ImportResult, error) {
	var res ImportResult
	if b.Version < 1 || b.Version > BundleVersion {
		return res, fmt.Errorf("unsupported sync file version %d", b.Version)
	}

	// Parents first, so every SaveFolder finds its parent.
	pending := append([]Folder(nil), b.Folders...)
	for len(pending) > 0 {
		var rest []Folder
		for _, f := range pending {
			if f.ParentID != "" && !s.folderExists(f.ParentID) {
				rest = append(rest, f)
				continue
			}
			if err := s.SaveFolder(f); err != nil {
				return res, err
			}
			res.Folders++
		}
		if len(rest) == len(pending) {
			// Orphans (parent missing from the file) go to the top level.
			for _, f := range rest {
				f.ParentID = ""
				if err := s.SaveFolder(f); err != nil {
					return res, err
				}
				res.Folders++
			}
			break
		}
		pending = rest
	}

	for _, i := range b.Identities {
		if err := s.SaveIdentity(i); err != nil {
			return res, err
		}
		res.Identities++
	}

	for _, p := range b.SSH {
		if p.FolderID != "" && !s.folderExists(p.FolderID) {
			p.FolderID = ""
		}
		var local *SSHProfile
		if cur, err := s.GetSSHProfile(p.ID); err == nil {
			local = &cur
			if cur.Host != p.Host || cur.Port != p.Port || cur.Username != p.Username || cur.JumpProfileID != p.JumpProfileID {
				res.Replaced = append(res.Replaced, cur.Name)
			}
		}
		if resetRiskyFlags(&p, local) {
			res.FlagsReset++
		}
		if err := s.SaveSSHProfile(p); err != nil {
			return res, err
		}
		res.Hosts++
	}
	for _, p := range b.RDP {
		if p.FolderID != "" && !s.folderExists(p.FolderID) {
			p.FolderID = ""
		}
		var local rdp.Options
		if cur, err := s.GetRDPProfile(p.ID); err == nil {
			if cur.Host != p.Host || cur.Port != p.Port || cur.Username != p.Username || cur.Domain != p.Domain || cur.Options.Gateway != p.Options.Gateway {
				res.Replaced = append(res.Replaced, cur.Name)
			} else {
				local = cur.Options
			}
		}
		if keepLocalRedirection(&p.Options, local) {
			res.RDPRedirectionSkipped++
		}
		if err := s.SaveRDPProfile(p); err != nil {
			return res, err
		}
		res.Hosts++
	}
	for _, p := range b.Streams {
		if cur, err := s.GetStreamProfile(p.ID); err == nil && (cur.Kind != p.Kind || cur.Host != p.Host || cur.Port != p.Port || cur.Device != p.Device) {
			res.Replaced = append(res.Replaced, cur.Name)
		}
		if err := s.SaveStreamProfile(p); err != nil {
			return res, err
		}
		res.Hosts++
	}
	for _, m := range b.Meta {
		if err := s.importMeta(m); err != nil {
			return res, err
		}
	}
	for _, sn := range b.Snippets {
		if err := s.SaveSnippet(sn); err != nil {
			return res, err
		}
		res.Snippets++
	}
	return res, nil
}

// Redirection permissions belong to this device and the reviewed destination.
func keepLocalRedirection(opts *rdp.Options, local rdp.Options) bool {
	changed := opts.Clipboard != local.Clipboard || opts.Printers != local.Printers ||
		opts.PrinterDrivers != local.PrinterDrivers && opts.Printers ||
		opts.Drives != local.Drives || opts.AllDrives != local.AllDrives ||
		opts.DrivesReadOnly != local.DrivesReadOnly || !slices.Equal(opts.DrivePaths, local.DrivePaths) ||
		opts.SmartCards != local.SmartCards || opts.ComPorts != local.ComPorts || opts.Usb != local.Usb ||
		opts.Microphone != local.Microphone || opts.Camera != local.Camera
	opts.Clipboard, opts.Printers, opts.PrinterDrivers = local.Clipboard, local.Printers, local.PrinterDrivers
	opts.Drives, opts.AllDrives, opts.DrivesReadOnly = local.Drives, local.AllDrives, local.DrivesReadOnly
	opts.DrivePaths = local.DrivePaths
	opts.SmartCards, opts.ComPorts, opts.Usb = local.SmartCards, local.ComPorts, local.Usb
	opts.Microphone, opts.Camera = local.Microphone, local.Camera
	return changed
}

// resetRiskyFlags turns off settings from a sync file that act on their own
// once the host is used: agent forwarding (lets the server use local keys),
// tunnels that start automatically, commands typed after login, a
// ProxyCommand and X11 forwarding. A setting the user already had on
// for the same local host (and the same tunnel) is kept. It reports whether
// anything was turned off.
func resetRiskyFlags(p *SSHProfile, local *SSHProfile) bool {
	changed := false
	if p.AgentForwarding && (local == nil || !local.AgentForwarding) {
		p.AgentForwarding = false
		changed = true
	}
	if p.Options.StartupCommands != "" && (local == nil || local.Options.StartupCommands != p.Options.StartupCommands) {
		p.Options.StartupCommands = ""
		changed = true
	}
	// A ProxyCommand runs a local program on every connect.
	if p.Proxy.Type == "command" && (local == nil || local.Proxy.Type != "command" || local.Proxy.Command != p.Proxy.Command) {
		p.Proxy = ProxySettings{}
		changed = true
	}
	if p.X11Forwarding && (local == nil || !local.X11Forwarding) {
		p.X11Forwarding = false
		changed = true
	}
	for i := range p.Tunnels {
		t := &p.Tunnels[i]
		if !t.AutoStart {
			continue
		}
		keep := false
		if local != nil {
			for _, lt := range local.Tunnels {
				if lt == *t {
					keep = true
					break
				}
			}
		}
		if !keep {
			t.AutoStart = false
			changed = true
		}
	}
	return changed
}
