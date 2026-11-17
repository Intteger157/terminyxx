package store

import (
	"errors"
	"strings"
)

// Snippet is a saved command (or multi-line script) the user can run in a
// terminal. {{name}} placeholders are filled in by the UI before running.
type Snippet struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Command     string `json:"command"`
	Description string `json:"description"`
	// Group is a free-form label used to sort snippets into sections.
	Group string `json:"group"`
	// Execute presses Enter after inserting; otherwise the text is only typed.
	Execute   bool `json:"execute"`
	SortOrder int  `json:"sortOrder"`
}

const snippetColumns = `id, name, command, description, grp, execute, sort_order`

func (s *Store) ListSnippets() ([]Snippet, error) {
	rows, err := s.db.Query(`SELECT ` + snippetColumns + ` FROM snippets ORDER BY grp, sort_order, name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Snippet{}
	for rows.Next() {
		var sn Snippet
		var exec int
		if err := rows.Scan(&sn.ID, &sn.Name, &sn.Command, &sn.Description, &sn.Group, &exec, &sn.SortOrder); err != nil {
			return nil, err
		}
		sn.Execute = exec == 1
		out = append(out, sn)
	}
	return out, rows.Err()
}

func (s *Store) SaveSnippet(sn Snippet) error {
	sn.Name = strings.TrimSpace(sn.Name)
	sn.Group = strings.TrimSpace(sn.Group)
	if sn.ID == "" {
		return errors.New("snippet id is required")
	}
	if sn.Name == "" || strings.TrimSpace(sn.Command) == "" {
		return errors.New("snippet needs a name and a command")
	}
	_, err := s.db.Exec(`
INSERT INTO snippets (`+snippetColumns+`) VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, command=excluded.command,
    description=excluded.description, grp=excluded.grp, execute=excluded.execute`,
		sn.ID, sn.Name, sn.Command, sn.Description, sn.Group, boolInt(sn.Execute), sn.SortOrder)
	return err
}

func (s *Store) DeleteSnippet(id string) error {
	_, err := s.db.Exec(`DELETE FROM snippets WHERE id = ?`, id)
	return err
}
