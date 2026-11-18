package store

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"errors"
	"strings"
	"time"
)

// HostMeta is what the sidebar keeps about any saved host (SSH, RDP or a
// stream): a star, free tags, notes and when it was last opened.
type HostMeta struct {
	Kind     string   `json:"kind"` // KindSSH | KindRDP | KindStream
	ID       string   `json:"id"`
	Favorite bool     `json:"favorite"`
	Tags     []string `json:"tags"`
	Notes    string   `json:"notes"`
	// LastUsed is the Unix time (ms) of the last connect, 0 = never.
	LastUsed int64 `json:"lastUsed"`
}

const (
	maxTags     = 32
	maxTagLen   = 40
	maxNotesLen = 16 << 10
)

func proxySecretKey(id string) string { return "proxy:" + id }

func validHostKind(k string) bool {
	return k == KindSSH || k == KindRDP || k == KindStream
}

// cleanTags trims, lower-cases, drops duplicates and caps the list.
func cleanTags(in []string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, t := range in {
		t = strings.ToLower(strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(t), "#")))
		t = strings.Join(strings.Fields(t), "-")
		if t == "" || seen[t] {
			continue
		}
		if len([]rune(t)) > maxTagLen {
			t = string([]rune(t)[:maxTagLen])
		}
		seen[t] = true
		out = append(out, t)
		if len(out) == maxTags {
			break
		}
	}
	return out
}

func (s *Store) ListHostMeta() ([]HostMeta, error) {
	rows, err := s.db.Query(`SELECT kind, id, favorite, tags, notes, last_used FROM host_meta`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []HostMeta{}
	for rows.Next() {
		var m HostMeta
		var fav int
		var tags string
		if err := rows.Scan(&m.Kind, &m.ID, &fav, &tags, &m.Notes, &m.LastUsed); err != nil {
			return nil, err
		}
		m.Favorite = fav == 1
		m.Tags = []string{}
		if tags != "" {
			_ = json.Unmarshal([]byte(tags), &m.Tags)
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// SaveHostMeta stores the star, tags and notes of a host. LastUsed is kept.
func (s *Store) SaveHostMeta(m HostMeta) error {
	if !validHostKind(m.Kind) || m.ID == "" {
		return errors.New("invalid host")
	}
	if len(m.Notes) > maxNotesLen {
		return errors.New("notes are too long (16 KB max)")
	}
	tags, err := json.Marshal(cleanTags(m.Tags))
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`
INSERT INTO host_meta (kind, id, favorite, tags, notes) VALUES (?, ?, ?, ?, ?)
ON CONFLICT(kind, id) DO UPDATE SET favorite=excluded.favorite, tags=excluded.tags, notes=excluded.notes`,
		m.Kind, m.ID, boolInt(m.Favorite), string(tags), m.Notes)
	return err
}

// TouchHost records that a saved host was just opened.
func (s *Store) TouchHost(kind, id string) error {
	if !validHostKind(kind) || id == "" {
		return errors.New("invalid host")
	}
	_, err := s.db.Exec(`
INSERT INTO host_meta (kind, id, last_used) VALUES (?, ?, ?)
ON CONFLICT(kind, id) DO UPDATE SET last_used=excluded.last_used`, kind, id, time.Now().UnixMilli())
	return err
}

func (s *Store) deleteMeta(kind, id string) {
	_, _ = s.db.Exec(`DELETE FROM host_meta WHERE kind=? AND id=?`, kind, id)
	_, _ = s.db.Exec(`DELETE FROM inventory_hosts WHERE host_kind=? AND host_id=?`, kind, id)
}

// importMeta merges metadata from a sync file: the star, tags and notes come
// from the file, the last use is the later of the two.
func (s *Store) importMeta(m HostMeta) error {
	if !validHostKind(m.Kind) || m.ID == "" {
		return nil
	}
	if err := s.SaveHostMeta(m); err != nil {
		return err
	}
	_, err := s.db.Exec(`UPDATE host_meta SET last_used = MAX(last_used, ?) WHERE kind=? AND id=?`, m.LastUsed, m.Kind, m.ID)
	return err
}

// ProxyPassword returns the saved proxy password of an SSH host ("" if none).
func (s *Store) ProxyPassword(id string) (string, error) {
	if s.secrets == nil {
		return "", nil
	}
	v, err := s.secrets.Get(proxySecretKey(id))
	if errors.Is(err, ErrSecretNotFound) {
		return "", nil
	}
	return v, err
}

// newID returns a random UUID (v4) for rows the backend creates itself.
func newID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}
