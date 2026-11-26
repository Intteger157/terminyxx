package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"terminyxx/internal/inventory"
	"terminyxx/internal/rdp"
)

// Inventory is a cloud or hypervisor account whose machines are mirrored
// into one folder of the host library. Its secret (Proxmox token secret, AWS
// secret access key) is kept in the keychain as "inv:<id>".
type Inventory struct {
	ID       string           `json:"id"`
	Name     string           `json:"name"`
	Kind     string           `json:"kind"` // inventory.KindProxmox | KindAWS
	Config   inventory.Config `json:"config"`
	FolderID string           `json:"folderId"`
	// LastSync is the Unix time (ms) of the last refresh, 0 = never.
	LastSync int64 `json:"lastSync"`
	// Secret is write-only like SSHProfile.Password.
	Secret      string `json:"secret"`
	HasSecret   bool   `json:"hasSecret"`
	ClearSecret bool   `json:"clearSecret"`
	// Hosts counts the library hosts this inventory created.
	Hosts int `json:"hosts"`
}

// InventorySync reports what a refresh changed.
type InventorySync struct {
	Added     int `json:"added"`
	Updated   int `json:"updated"`
	Unchanged int `json:"unchanged"`
	// Gone are hosts whose machine no longer exists; they are kept.
	Gone []string `json:"gone"`
	// NoAddress counts machines skipped because no IP address is known.
	NoAddress int `json:"noAddress"`
}

func invSecretKey(id string) string { return "inv:" + id }

func (s *Store) ListInventories() ([]Inventory, error) {
	rows, err := s.db.Query(`SELECT id, name, kind, config, folder_id, last_sync,
    (SELECT COUNT(*) FROM inventory_hosts h WHERE h.inventory_id = inventories.id)
FROM inventories ORDER BY sort_order, name`)
	if err != nil {
		return nil, err
	}
	out := []Inventory{}
	for rows.Next() {
		var inv Inventory
		var cfg string
		if err := rows.Scan(&inv.ID, &inv.Name, &inv.Kind, &cfg, &inv.FolderID, &inv.LastSync, &inv.Hosts); err != nil {
			rows.Close()
			return nil, err
		}
		if cfg != "" {
			_ = json.Unmarshal([]byte(cfg), &inv.Config)
		}
		out = append(out, inv)
	}
	rows.Close()
	for i := range out {
		out[i].HasSecret = s.hasSecretKey(invSecretKey(out[i].ID))
		if out[i].Config.Regions == nil {
			out[i].Config.Regions = []string{}
		}
	}
	return out, rows.Err()
}

func (s *Store) GetInventory(id string) (Inventory, error) {
	list, err := s.ListInventories()
	if err != nil {
		return Inventory{}, err
	}
	for _, inv := range list {
		if inv.ID == id {
			return inv, nil
		}
	}
	return Inventory{}, errors.New("inventory not found")
}

func (s *Store) InventorySecret(id string) (string, error) {
	if s.secrets == nil {
		return "", ErrNoSecureStorage
	}
	v, err := s.secrets.Get(invSecretKey(id))
	if errors.Is(err, ErrSecretNotFound) {
		return "", nil
	}
	return v, err
}

func (s *Store) SaveInventory(inv Inventory) error {
	inv.Name = strings.TrimSpace(inv.Name)
	if inv.ID == "" || inv.Name == "" {
		return errors.New("name is required")
	}
	if inv.Kind != inventory.KindProxmox && inv.Kind != inventory.KindAWS {
		return fmt.Errorf("unknown inventory type %q", inv.Kind)
	}
	switch {
	case inv.Secret != "":
		if err := s.storeSecret(invSecretKey(inv.ID), inv.Secret); err != nil {
			return err
		}
	case inv.ClearSecret:
		if s.secrets != nil {
			_ = s.secrets.Delete(invSecretKey(inv.ID))
		}
	}
	if inv.Config.Regions == nil {
		inv.Config.Regions = []string{}
	}
	cfg, err := json.Marshal(inv.Config)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`
INSERT INTO inventories (id, name, kind, config, folder_id) VALUES (?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, kind=excluded.kind, config=excluded.config, folder_id=excluded.folder_id`,
		inv.ID, inv.Name, inv.Kind, string(cfg), inv.FolderID)
	return err
}

// DeleteInventory forgets an account. The hosts it created stay in the
// library as ordinary hosts.
func (s *Store) DeleteInventory(id string) error {
	if s.secrets != nil {
		_ = s.secrets.Delete(invSecretKey(id))
	}
	if _, err := s.db.Exec(`DELETE FROM inventory_hosts WHERE inventory_id=?`, id); err != nil {
		return err
	}
	_, err := s.db.Exec(`DELETE FROM inventories WHERE id=?`, id)
	return err
}

type invLink struct{ kind, hostID string }

// ApplyInventory mirrors the machines of a refresh into the inventory's
// folder: new machines become hosts (RDP for Windows, else SSH), known ones
// get their current name and address. The user's own changes to login, key,
// notes and so on are kept, and hosts are never deleted.
func (s *Store) ApplyInventory(id string, list []inventory.Instance) (InventorySync, error) {
	var res InventorySync
	inv, err := s.GetInventory(id)
	if err != nil {
		return res, err
	}
	if inv.FolderID == "" || !s.folderExists(inv.FolderID) {
		inv.FolderID = newID()
		if err := s.SaveFolder(Folder{ID: inv.FolderID, Name: inv.Name}); err != nil {
			return res, err
		}
		if _, err := s.db.Exec(`UPDATE inventories SET folder_id=? WHERE id=?`, inv.FolderID, id); err != nil {
			return res, err
		}
	}

	links := map[string]invLink{}
	rows, err := s.db.Query(`SELECT external_id, host_kind, host_id FROM inventory_hosts WHERE inventory_id=?`, id)
	if err != nil {
		return res, err
	}
	for rows.Next() {
		var ext string
		var l invLink
		if rows.Scan(&ext, &l.kind, &l.hostID) == nil {
			links[ext] = l
		}
	}
	rows.Close()

	seen := map[string]bool{}
	for _, in := range list {
		if in.ExternalID == "" || seen[in.ExternalID] {
			continue
		}
		seen[in.ExternalID] = true
		if in.Address == "" {
			res.NoAddress++
			continue
		}
		name := strings.TrimSpace(in.Name)
		if name == "" {
			name = in.Address
		}
		if l, ok := links[in.ExternalID]; ok {
			changed, found, err := s.refreshHost(l, name, in.Address)
			if err != nil {
				return res, err
			}
			if found {
				if changed {
					res.Updated++
				} else {
					res.Unchanged++
				}
				continue
			}
			// The user deleted the host: add it again.
		}
		l, err := s.addInventoryHost(inv, in, name)
		if err != nil {
			return res, err
		}
		if _, err := s.db.Exec(`INSERT OR REPLACE INTO inventory_hosts (inventory_id, external_id, host_kind, host_id) VALUES (?, ?, ?, ?)`,
			id, in.ExternalID, l.kind, l.hostID); err != nil {
			return res, err
		}
		res.Added++
	}
	for ext, l := range links {
		if seen[ext] {
			continue
		}
		if name := s.hostName(l); name != "" {
			res.Gone = append(res.Gone, name)
		}
	}
	_, err = s.db.Exec(`UPDATE inventories SET last_sync=? WHERE id=?`, time.Now().UnixMilli(), id)
	return res, err
}

func (s *Store) hostName(l invLink) string {
	table := "ssh_profiles"
	if l.kind == KindRDP {
		table = "rdp_profiles"
	}
	var name string
	_ = s.db.QueryRow(`SELECT name FROM `+table+` WHERE id=?`, l.hostID).Scan(&name)
	return name
}

// refreshHost updates the name and address of a host an inventory created.
func (s *Store) refreshHost(l invLink, name, addr string) (changed, found bool, err error) {
	s.profileMu.Lock()
	defer s.profileMu.Unlock()
	table := "ssh_profiles"
	if l.kind == KindRDP {
		table = "rdp_profiles"
	}
	var curName, curHost string
	err = s.db.QueryRow(`SELECT name, host FROM `+table+` WHERE id=?`, l.hostID).Scan(&curName, &curHost)
	if errors.Is(err, sql.ErrNoRows) {
		return false, false, nil
	}
	if err != nil {
		return false, false, err
	}
	if curName == name && curHost == addr {
		return false, true, nil
	}
	_, err = s.db.Exec(`UPDATE `+table+` SET name=?, host=? WHERE id=?`, name, addr, l.hostID)
	return err == nil, true, err
}

func (s *Store) addInventoryHost(inv Inventory, in inventory.Instance, name string) (invLink, error) {
	id := newID()
	cfg := inv.Config
	if in.Windows {
		p := rdp.RDPProfile{
			ID: id, Name: name, Host: in.Address, Port: 3389, Username: cfg.Username,
			Width: 1920, Height: 1080, FolderID: inv.FolderID, Options: rdp.DefaultOptions(),
		}
		if err := s.SaveRDPProfile(p); err != nil {
			return invLink{}, err
		}
		_ = s.SaveHostMeta(HostMeta{Kind: KindRDP, ID: id, Tags: in.Tags})
		return invLink{KindRDP, id}, nil
	}
	auth := "password"
	if cfg.KeyPath != "" {
		auth = "key"
	}
	p := SSHProfile{
		ID: id, Name: name, Host: in.Address, Port: 22, Username: cfg.Username,
		AuthType: auth, KeyPath: cfg.KeyPath, FolderID: inv.FolderID, IdentityID: cfg.IdentityID,
	}
	if p.Username == "" && p.IdentityID == "" {
		p.Username = "root"
	}
	if err := s.SaveSSHProfile(p); err != nil {
		return invLink{}, err
	}
	_ = s.SaveHostMeta(HostMeta{Kind: KindSSH, ID: id, Tags: in.Tags})
	return invLink{KindSSH, id}, nil
}
