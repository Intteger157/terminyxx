package store

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

// StreamProfile is a saved Telnet or serial connection. It has no login: the
// device asks for one in the terminal, if at all.
type StreamProfile struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Kind     string `json:"kind"` // "telnet" | "serial"
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Device   string `json:"device"`
	Baud     int    `json:"baud"`
	DataBits int    `json:"dataBits"`
	Parity   string `json:"parity"`
	StopBits string `json:"stopBits"`

	FolderID  string `json:"folderId"`
	SortOrder int    `json:"sortOrder"`
}

const streamColumns = `id, name, kind, host, port, device, baud, data_bits, parity, stop_bits, folder_id, sort_order`

func scanStream(row interface{ Scan(...any) error }) (StreamProfile, error) {
	var p StreamProfile
	err := row.Scan(&p.ID, &p.Name, &p.Kind, &p.Host, &p.Port, &p.Device, &p.Baud, &p.DataBits, &p.Parity, &p.StopBits, &p.FolderID, &p.SortOrder)
	return p, err
}

// normalizeStream checks a profile and fills in defaults.
func normalizeStream(p *StreamProfile) error {
	p.Name = strings.TrimSpace(p.Name)
	p.Host = strings.TrimSpace(p.Host)
	p.Device = strings.TrimSpace(p.Device)
	if p.ID == "" {
		return errors.New("profile id is required")
	}
	switch p.Kind {
	case KindTelnet:
		if p.Host == "" {
			return errors.New("host is required")
		}
		if p.Port <= 0 || p.Port > 65535 {
			p.Port = 23
		}
		if p.Name == "" {
			p.Name = p.Host
		}
	case KindSerial:
		if p.Device == "" {
			return errors.New("serial port is required")
		}
		if p.Name == "" {
			p.Name = p.Device
		}
	default:
		return fmt.Errorf("unknown connection kind %q", p.Kind)
	}
	if p.Baud <= 0 {
		p.Baud = 9600
	}
	if p.DataBits < 5 || p.DataBits > 8 {
		p.DataBits = 8
	}
	switch p.Parity {
	case "none", "even", "odd", "mark", "space":
	default:
		p.Parity = "none"
	}
	switch p.StopBits {
	case "1", "1.5", "2":
	default:
		p.StopBits = "1"
	}
	return nil
}

func (s *Store) ListStreamProfiles() ([]StreamProfile, error) {
	rows, err := s.db.Query(`SELECT ` + streamColumns + ` FROM stream_profiles ORDER BY sort_order, name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []StreamProfile{}
	for rows.Next() {
		p, err := scanStream(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) GetStreamProfile(id string) (StreamProfile, error) {
	p, err := scanStream(s.db.QueryRow(`SELECT `+streamColumns+` FROM stream_profiles WHERE id = ?`, id))
	if err != nil {
		return p, fmt.Errorf("get connection profile: %w", err)
	}
	return p, nil
}

func (s *Store) SaveStreamProfile(p StreamProfile) error {
	if err := normalizeStream(&p); err != nil {
		return err
	}
	if p.FolderID != "" && !s.folderExists(p.FolderID) {
		p.FolderID = ""
	}
	var sortOrder int
	err := s.db.QueryRow(`SELECT sort_order FROM stream_profiles WHERE id = ?`, p.ID).Scan(&sortOrder)
	if errors.Is(err, sql.ErrNoRows) {
		sortOrder = s.nextHostOrder(p.FolderID)
	} else if err != nil {
		return err
	}
	_, err = s.db.Exec(`
INSERT INTO stream_profiles (`+streamColumns+`)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, kind=excluded.kind, host=excluded.host, port=excluded.port, device=excluded.device,
    baud=excluded.baud, data_bits=excluded.data_bits, parity=excluded.parity, stop_bits=excluded.stop_bits,
    folder_id=excluded.folder_id
`, p.ID, p.Name, p.Kind, p.Host, p.Port, p.Device, p.Baud, p.DataBits, p.Parity, p.StopBits, p.FolderID, sortOrder)
	return err
}

func (s *Store) DeleteStreamProfile(id string) error {
	_, err := s.db.Exec(`DELETE FROM stream_profiles WHERE id = ?`, id)
	return err
}
