package store

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
	"terminyxx/internal/rdp"
)

type SSHProfile struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	AuthType string `json:"authType"`
	Password string `json:"password"` // TODO: encrypt via OS keychain
	KeyPath  string `json:"keyPath"`
}

type Store struct {
	db *sql.DB
}

func New() (*Store, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return nil, err
	}

	appDir := filepath.Join(configDir, "terminyxx")
	if err := os.MkdirAll(appDir, 0o755); err != nil {
		return nil, err
	}

	dbPath := filepath.Join(appDir, "terminyxx.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}

	store := &Store{db: db}
	if err := store.migrate(); err != nil {
		_ = db.Close()
		return nil, err
	}

	return store, nil
}

func (s *Store) migrate() error {
	schema := `
CREATE TABLE IF NOT EXISTS ssh_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 22,
    username TEXT NOT NULL,
    auth_type TEXT NOT NULL DEFAULT 'password',
    password TEXT NOT NULL DEFAULT '',
    key_path TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS rdp_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 3389,
    username TEXT NOT NULL DEFAULT '',
    domain TEXT NOT NULL DEFAULT '',
    password TEXT NOT NULL DEFAULT '',
    width INTEGER NOT NULL DEFAULT 1920,
    height INTEGER NOT NULL DEFAULT 1080,
    fullscreen INTEGER NOT NULL DEFAULT 0
);
`
	_, err := s.db.Exec(schema)
	return err
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) ListSSHProfiles() ([]SSHProfile, error) {
	rows, err := s.db.Query(`SELECT id, name, host, port, username, auth_type, password, key_path FROM ssh_profiles ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var profiles []SSHProfile
	for rows.Next() {
		var p SSHProfile
		if err := rows.Scan(&p.ID, &p.Name, &p.Host, &p.Port, &p.Username, &p.AuthType, &p.Password, &p.KeyPath); err != nil {
			return nil, err
		}
		profiles = append(profiles, p)
	}
	return profiles, rows.Err()
}

func (s *Store) SaveSSHProfile(p SSHProfile) error {
	_, err := s.db.Exec(`
INSERT INTO ssh_profiles (id, name, host, port, username, auth_type, password, key_path)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    host=excluded.host,
    port=excluded.port,
    username=excluded.username,
    auth_type=excluded.auth_type,
    password=excluded.password,
    key_path=excluded.key_path
`, p.ID, p.Name, p.Host, p.Port, p.Username, p.AuthType, p.Password, p.KeyPath)
	return err
}

func (s *Store) DeleteSSHProfile(id string) error {
	_, err := s.db.Exec(`DELETE FROM ssh_profiles WHERE id = ?`, id)
	return err
}

func (s *Store) ListRDPProfiles() ([]rdp.RDPProfile, error) {
	rows, err := s.db.Query(`SELECT id, name, host, port, username, domain, password, width, height, fullscreen FROM rdp_profiles ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var profiles []rdp.RDPProfile
	for rows.Next() {
		var p rdp.RDPProfile
		var fullscreen int
		if err := rows.Scan(&p.ID, &p.Name, &p.Host, &p.Port, &p.Username, &p.Domain, &p.Password, &p.Width, &p.Height, &fullscreen); err != nil {
			return nil, err
		}
		p.Fullscreen = fullscreen == 1
		profiles = append(profiles, p)
	}
	return profiles, rows.Err()
}

func (s *Store) SaveRDPProfile(p rdp.RDPProfile) error {
	fullscreen := 0
	if p.Fullscreen {
		fullscreen = 1
	}
	_, err := s.db.Exec(`
INSERT INTO rdp_profiles (id, name, host, port, username, domain, password, width, height, fullscreen)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    host=excluded.host,
    port=excluded.port,
    username=excluded.username,
    domain=excluded.domain,
    password=excluded.password,
    width=excluded.width,
    height=excluded.height,
    fullscreen=excluded.fullscreen
`, p.ID, p.Name, p.Host, p.Port, p.Username, p.Domain, p.Password, p.Width, p.Height, fullscreen)
	return err
}

func (s *Store) DeleteRDPProfile(id string) error {
	_, err := s.db.Exec(`DELETE FROM rdp_profiles WHERE id = ?`, id)
	return err
}

func (s *Store) GetRDPProfile(id string) (rdp.RDPProfile, error) {
	var p rdp.RDPProfile
	var fullscreen int
	err := s.db.QueryRow(`
SELECT id, name, host, port, username, domain, password, width, height, fullscreen
FROM rdp_profiles WHERE id = ?
`, id).Scan(&p.ID, &p.Name, &p.Host, &p.Port, &p.Username, &p.Domain, &p.Password, &p.Width, &p.Height, &fullscreen)
	if err != nil {
		return p, fmt.Errorf("get rdp profile: %w", err)
	}
	p.Fullscreen = fullscreen == 1
	return p, nil
}

func (s *Store) GetSSHProfile(id string) (SSHProfile, error) {
	var p SSHProfile
	err := s.db.QueryRow(`
SELECT id, name, host, port, username, auth_type, password, key_path
FROM ssh_profiles WHERE id = ?
`, id).Scan(&p.ID, &p.Name, &p.Host, &p.Port, &p.Username, &p.AuthType, &p.Password, &p.KeyPath)
	if err != nil {
		return p, fmt.Errorf("get ssh profile: %w", err)
	}
	return p, nil
}
