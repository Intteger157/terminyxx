package rdpdrive

import (
	"errors"
	"io/fs"
	"strconv"
	"strings"
	"sync"
)

// FirstDeviceID is the RDPDR device ID of the first drive; printers use small
// IDs from 2 up, so the two never collide.
const FirstDeviceID = 1000

func commonStatus(err error) uint32 {
	switch {
	case err == nil:
		return StatusSuccess
	case errors.Is(err, fs.ErrNotExist):
		return StatusNoSuchFile
	case errors.Is(err, fs.ErrExist):
		return StatusObjectNameCollision
	case errors.Is(err, fs.ErrPermission):
		return StatusAccessDenied
	case isEscape(err):
		// os.Root refused a path or link leading outside the drive.
		return StatusAccessDenied
	}
	return StatusUnsuccessful
}

// Plan lists the drives to share: every local drive when all is set,
// otherwise the given folders. Names are made unique and IDs assigned from
// FirstDeviceID.
func Plan(paths []string, all, readOnly bool) []Drive {
	var drives []Drive
	if all {
		drives = localDrives()
	} else {
		seen := map[string]bool{}
		for _, p := range paths {
			p = strings.TrimSpace(p)
			if p == "" || seen[strings.ToLower(p)] {
				continue
			}
			seen[strings.ToLower(p)] = true
			drives = append(drives, Drive{Name: driveName(p), Path: p})
		}
	}
	used := map[string]bool{}
	for i := range drives {
		d := &drives[i]
		d.ID = FirstDeviceID + uint32(i)
		d.ReadOnly = readOnly
		if d.Name == "" {
			d.Name = "Folder"
		}
		name := d.Name
		for n := 2; used[strings.ToLower(name)]; n++ {
			name = d.Name + " (" + strconv.Itoa(n) + ")"
		}
		used[strings.ToLower(name)] = true
		d.Name = name
	}
	return drives
}

// Manager keeps the drive session of each RDP tab.
type Manager struct {
	mu       sync.Mutex
	sessions map[string]*Session
}

func NewManager() *Manager {
	return &Manager{sessions: map[string]*Session{}}
}

// Open starts the drive session of tab, replacing an earlier one, and returns
// the drives that could be opened and those that could not.
func (m *Manager) Open(tab string, drives []Drive) (opened, failed []Drive) {
	s, failed := NewSession(drives)
	m.mu.Lock()
	old := m.sessions[tab]
	m.sessions[tab] = s
	m.mu.Unlock()
	if old != nil {
		old.Close()
	}
	return s.Drives(), failed
}

// Get returns the drive session of tab, or nil.
func (m *Manager) Get(tab string) *Session {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.sessions[tab]
}

// Close ends the drive session of tab.
func (m *Manager) Close(tab string) {
	m.mu.Lock()
	s := m.sessions[tab]
	delete(m.sessions, tab)
	m.mu.Unlock()
	if s != nil {
		s.Close()
	}
}

// CloseAll ends every drive session.
func (m *Manager) CloseAll() {
	m.mu.Lock()
	sessions := m.sessions
	m.sessions = map[string]*Session{}
	m.mu.Unlock()
	for _, s := range sessions {
		s.Close()
	}
}

// isEscape reports os.Root refusing a path or link that leads outside the drive.
func isEscape(err error) bool {
	return err != nil && strings.Contains(err.Error(), "escapes from parent")
}
