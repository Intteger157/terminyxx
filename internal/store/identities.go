package store

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
)

// Identity is a reusable login (user name plus password or key) that SSH
// hosts can point to, so a password changed once applies to every host that
// uses it. Its password lives in the keychain under "ident:<id>".
type Identity struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Username string `json:"username"`
	AuthType string `json:"authType"`
	// Password is write-only, like SSHProfile.Password.
	Password      string `json:"password"`
	HasPassword   bool   `json:"hasPassword"`
	ClearPassword bool   `json:"clearPassword"`
	KeyPath       string `json:"keyPath"`
	SortOrder     int    `json:"sortOrder"`
	// Hosts is how many SSH hosts use this identity (read-only).
	Hosts int `json:"hosts"`
}

func identSecretKey(id string) string { return "ident:" + id }

const identityColumns = `id, name, username, auth_type, key_path, sort_order`

func scanIdentity(row interface{ Scan(...any) error }) (Identity, error) {
	var i Identity
	err := row.Scan(&i.ID, &i.Name, &i.Username, &i.AuthType, &i.KeyPath, &i.SortOrder)
	return i, err
}

func (s *Store) ListIdentities() ([]Identity, error) {
	rows, err := s.db.Query(`SELECT ` + identityColumns + `,
    (SELECT COUNT(*) FROM ssh_profiles p WHERE p.identity_id = identities.id)
FROM identities ORDER BY sort_order, name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Identity{}
	for rows.Next() {
		var i Identity
		if err := rows.Scan(&i.ID, &i.Name, &i.Username, &i.AuthType, &i.KeyPath, &i.SortOrder, &i.Hosts); err != nil {
			return nil, err
		}
		out = append(out, i)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for k := range out {
		out[k].HasPassword = s.hasSecretKey(identSecretKey(out[k].ID))
	}
	return out, nil
}

// GetIdentity returns an identity without its password.
func (s *Store) GetIdentity(id string) (Identity, error) {
	i, err := scanIdentity(s.db.QueryRow(`SELECT `+identityColumns+` FROM identities WHERE id = ?`, id))
	if err != nil {
		return i, fmt.Errorf("get identity: %w", err)
	}
	i.HasPassword = s.hasSecretKey(identSecretKey(i.ID))
	return i, nil
}

func (s *Store) identityExists(id string) bool {
	var one int
	return s.db.QueryRow(`SELECT 1 FROM identities WHERE id = ?`, id).Scan(&one) == nil
}

// IdentityPassword returns the identity's stored password ("" if none).
func (s *Store) IdentityPassword(id string) (string, error) {
	if s.secrets == nil {
		return "", nil
	}
	v, err := s.secrets.Get(identSecretKey(id))
	if errors.Is(err, ErrSecretNotFound) {
		return "", nil
	}
	return v, err
}

func (s *Store) SaveIdentity(i Identity) error {
	s.profileMu.Lock()
	defer s.profileMu.Unlock()
	return s.saveIdentity(i)
}

func (s *Store) saveIdentity(i Identity) error {
	if i.ID == "" {
		return errors.New("identity id is required")
	}
	if i.AuthType != "key" {
		i.AuthType = "password"
	}
	switch {
	case i.Password != "":
		if err := s.storeSecret(identSecretKey(i.ID), i.Password); err != nil {
			return err
		}
	case i.ClearPassword:
		if s.secrets != nil {
			_ = s.secrets.Delete(identSecretKey(i.ID))
		}
	}
	var order int
	err := s.db.QueryRow(`SELECT sort_order FROM identities WHERE id = ?`, i.ID).Scan(&order)
	if errors.Is(err, sql.ErrNoRows) {
		_ = s.db.QueryRow(`SELECT COALESCE(MAX(sort_order), -1) + 1 FROM identities`).Scan(&order)
	} else if err != nil {
		return err
	}
	_, err = s.db.Exec(`
INSERT INTO identities (`+identityColumns+`) VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, username=excluded.username,
    auth_type=excluded.auth_type, key_path=excluded.key_path`,
		i.ID, i.Name, i.Username, i.AuthType, i.KeyPath, order)
	return err
}

// DeleteIdentity removes an identity. The hosts that used it keep working:
// its user, auth type, key and password are copied into each of them first.
func (s *Store) DeleteIdentity(id string) error {
	s.profileMu.Lock()
	defer s.profileMu.Unlock()
	ident, err := s.GetIdentity(id)
	if err != nil {
		return err
	}
	pw, _ := s.IdentityPassword(id)
	rows, err := s.db.Query(`SELECT id FROM ssh_profiles WHERE identity_id = ?`, id)
	if err != nil {
		return err
	}
	var hosts []string
	for rows.Next() {
		var h string
		if rows.Scan(&h) == nil {
			hosts = append(hosts, h)
		}
	}
	rows.Close()
	for _, h := range hosts {
		if pw != "" {
			if err := s.storeSecret(sshSecretKey(h), pw); err != nil {
				log.Printf("store: copy identity password to host %s: %v", h, err)
			}
		}
		if _, err := s.db.Exec(`UPDATE ssh_profiles SET identity_id='', username=?, auth_type=?, key_path=? WHERE id=?`,
			ident.Username, ident.AuthType, ident.KeyPath, h); err != nil {
			return err
		}
	}
	if s.secrets != nil {
		_ = s.secrets.Delete(identSecretKey(id))
	}
	_, err = s.db.Exec(`DELETE FROM identities WHERE id = ?`, id)
	return err
}

// applyIdentity replaces a host's login with its identity's, so everything
// that reads a profile (lists, connect, jump hosts) sees the effective values.
// A dangling identity ID is ignored.
func (s *Store) applyIdentity(p *SSHProfile) bool {
	if p.IdentityID == "" {
		return false
	}
	ident, err := s.GetIdentity(p.IdentityID)
	if err != nil {
		return false
	}
	p.Username = ident.Username
	p.AuthType = ident.AuthType
	p.KeyPath = ident.KeyPath
	p.HasPassword = ident.HasPassword
	return true
}
