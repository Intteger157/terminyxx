package store

import (
	"database/sql"
	"errors"
	"fmt"
)

// Item kinds for MoveItem.
const (
	KindFolder = "folder"
	KindSSH    = "ssh"
	KindRDP    = "rdp"
)

var ErrFolderCycle = errors.New("cannot move a folder into itself")

func (s *Store) ListFolders() ([]Folder, error) {
	rows, err := s.db.Query(`SELECT id, name, parent_id, color, sort_order FROM folders ORDER BY sort_order, name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	folders := []Folder{}
	for rows.Next() {
		var f Folder
		if err := rows.Scan(&f.ID, &f.Name, &f.ParentID, &f.Color, &f.SortOrder); err != nil {
			return nil, err
		}
		folders = append(folders, f)
	}
	return folders, rows.Err()
}

// SaveFolder creates or renames/recolors a folder. Moving is done with
// MoveItem so cycles are checked; ParentID is only used on create.
func (s *Store) SaveFolder(f Folder) error {
	if f.ID == "" || f.Name == "" {
		return errors.New("folder id and name are required")
	}
	res, err := s.db.Exec(`UPDATE folders SET name=?, color=? WHERE id=?`, f.Name, f.Color, f.ID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n > 0 {
		return nil
	}
	if f.ParentID != "" && !s.folderExists(f.ParentID) {
		return fmt.Errorf("parent folder %s not found", f.ParentID)
	}
	var next int
	_ = s.db.QueryRow(`SELECT COALESCE(MAX(sort_order)+1, 0) FROM folders WHERE parent_id=?`, f.ParentID).Scan(&next)
	_, err = s.db.Exec(`INSERT INTO folders (id, name, parent_id, color, sort_order) VALUES (?, ?, ?, ?, ?)`,
		f.ID, f.Name, f.ParentID, f.Color, next)
	return err
}

// DeleteFolder removes a folder; its subfolders and hosts move up to the
// folder's parent instead of being deleted.
func (s *Store) DeleteFolder(id string) error {
	var parent string
	err := s.db.QueryRow(`SELECT parent_id FROM folders WHERE id=?`, id).Scan(&parent)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	for _, q := range []string{
		`UPDATE folders SET parent_id=? WHERE parent_id=?`,
		`UPDATE ssh_profiles SET folder_id=? WHERE folder_id=?`,
		`UPDATE rdp_profiles SET folder_id=? WHERE folder_id=?`,
	} {
		if _, err := tx.Exec(q, parent, id); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(`DELETE FROM folders WHERE id=?`, id); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) folderExists(id string) bool {
	var one int
	return s.db.QueryRow(`SELECT 1 FROM folders WHERE id=?`, id).Scan(&one) == nil
}

func (s *Store) nextHostOrder(folderID string) int {
	var next int
	_ = s.db.QueryRow(`
SELECT COALESCE(MAX(o)+1, 0) FROM (
  SELECT sort_order AS o FROM ssh_profiles WHERE folder_id=?
  UNION ALL SELECT sort_order FROM rdp_profiles WHERE folder_id=?
)`, folderID, folderID).Scan(&next)
	return next
}

// MoveItem moves a folder or host into parentID ("" = root) at position
// index among its siblings of the same group. Folders and hosts are ordered
// separately (folders are always listed before hosts); SSH and RDP hosts
// share one order. A negative index appends.
func (s *Store) MoveItem(kind, id, parentID string, index int) error {
	if parentID != "" && !s.folderExists(parentID) {
		return fmt.Errorf("folder %s not found", parentID)
	}
	if kind == KindFolder {
		if err := s.checkNoCycle(id, parentID); err != nil {
			return err
		}
	}

	type sib struct{ kind, id string }
	var sibs []sib
	var query string
	var args []any
	if kind == KindFolder {
		query = `SELECT 'folder', id FROM folders WHERE parent_id=? AND id!=? ORDER BY sort_order, name`
		args = []any{parentID, id}
	} else {
		query = `
SELECT k, id FROM (
  SELECT 'ssh' AS k, id, name, sort_order FROM ssh_profiles WHERE folder_id=?
  UNION ALL SELECT 'rdp', id, name, sort_order FROM rdp_profiles WHERE folder_id=?
) WHERE NOT (k=? AND id=?) ORDER BY sort_order, name`
		args = []any{parentID, parentID, kind, id}
	}
	rows, err := s.db.Query(query, args...)
	if err != nil {
		return err
	}
	for rows.Next() {
		var x sib
		if err := rows.Scan(&x.kind, &x.id); err != nil {
			rows.Close()
			return err
		}
		sibs = append(sibs, x)
	}
	rows.Close()

	if index < 0 || index > len(sibs) {
		index = len(sibs)
	}
	ordered := append([]sib{}, sibs[:index]...)
	ordered = append(ordered, sib{kind, id})
	ordered = append(ordered, sibs[index:]...)

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	for i, x := range ordered {
		var q string
		switch x.kind {
		case KindFolder:
			q = `UPDATE folders SET sort_order=?, parent_id=? WHERE id=?`
		case KindSSH:
			q = `UPDATE ssh_profiles SET sort_order=?, folder_id=? WHERE id=?`
		case KindRDP:
			q = `UPDATE rdp_profiles SET sort_order=?, folder_id=? WHERE id=?`
		default:
			return fmt.Errorf("unknown item kind %q", x.kind)
		}
		if _, err := tx.Exec(q, i, parentID, x.id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// checkNoCycle fails if parentID is folder id itself or one of its descendants.
func (s *Store) checkNoCycle(id, parentID string) error {
	for cur, depth := parentID, 0; cur != ""; depth++ {
		if cur == id {
			return ErrFolderCycle
		}
		if depth > 256 {
			return ErrFolderCycle
		}
		if err := s.db.QueryRow(`SELECT parent_id FROM folders WHERE id=?`, cur).Scan(&cur); err != nil {
			return nil
		}
	}
	return nil
}
