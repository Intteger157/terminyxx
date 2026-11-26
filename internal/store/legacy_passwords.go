package store

import (
	"errors"
	"log"
)

// MoveLegacyPasswords transfers old SSH and RDP passwords into the keychain.
// It can be retried after unlocking the vault or restoring access to the
// keychain. A database value is cleared only after the keychain has a value.
func (s *Store) MoveLegacyPasswords() {
	if s.secrets == nil {
		return
	}
	s.profileMu.Lock()
	defer s.profileMu.Unlock()

	for _, source := range []struct {
		table string
		key   func(string) string
	}{
		{"ssh_profiles", sshSecretKey},
		{"rdp_profiles", rdpSecretKey},
	} {
		if err := s.moveLegacyPasswords(source.table, source.key); err != nil && !errors.Is(err, ErrSecretLocked) {
			log.Printf("store: migrate legacy passwords from %s: %v", source.table, err)
		}
	}
	// Retry the checkpoint even when there are no remaining rows to move.
	// A reader may have prevented truncation after an earlier migration.
	var busy, total, checkpointed int
	err := s.db.QueryRow(`PRAGMA wal_checkpoint(TRUNCATE)`).Scan(&busy, &total, &checkpointed)
	if err != nil {
		log.Printf("store: checkpoint legacy password migration: %v", err)
	} else if busy != 0 {
		log.Print("store: legacy password migration checkpoint deferred")
	}
}

func (s *Store) moveLegacyPasswords(table string, secretKey func(string) string) error {
	type password struct{ id, value string }
	rows, err := s.db.Query(`SELECT id, password FROM ` + table + ` WHERE password != ''`)
	if err != nil {
		return err
	}
	defer rows.Close()
	var pending []password
	for rows.Next() {
		var p password
		if err := rows.Scan(&p.id, &p.value); err != nil {
			return err
		}
		pending = append(pending, p)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}

	var ready []password
	var firstError error
	for _, p := range pending {
		key := secretKey(p.id)
		stored, err := s.secrets.Get(key)
		// Keep a password that was already saved or migrated on a past run.
		if errors.Is(err, ErrSecretNotFound) || (err == nil && stored == "") {
			err = s.secrets.Set(key, p.value)
		}
		if err != nil {
			if firstError == nil {
				firstError = err
			}
			continue
		}
		ready = append(ready, p)
	}
	if len(ready) == 0 {
		return firstError
	}

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`PRAGMA secure_delete=ON`); err != nil {
		return err
	}
	for _, p := range ready {
		if _, err := tx.Exec(`UPDATE `+table+` SET password = '' WHERE id = ? AND password = ?`, p.id, p.value); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return firstError
}
