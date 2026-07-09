package connection

import (
	"errors"
	"fmt"
	"os"
	"sync"
)

type EventEmitter interface {
	Emit(event string, data ...interface{})
}

type ConnectionManager struct {
	mu          sync.RWMutex
	connections map[string]*ManagedConnection
	emitter     EventEmitter
}

func NewConnectionManager(emitter EventEmitter) *ConnectionManager {
	return &ConnectionManager{
		connections: make(map[string]*ManagedConnection),
		emitter:     emitter,
	}
}

func (m *ConnectionManager) Connect(req ConnectRequest) error {
	if req.ID == "" {
		return errors.New("connection id is required")
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if existing, ok := m.connections[req.ID]; ok {
		_ = existing.Close()
		delete(m.connections, req.ID)
	}

	conn, err := newManagedConnection(req, m.emitter)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}

	m.connections[req.ID] = conn
	m.emitter.Emit("connection:state:"+req.ID, "connected")
	return nil
}

func (m *ConnectionManager) Disconnect(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	conn, ok := m.connections[id]
	if !ok {
		return errors.New("connection not found")
	}

	err := conn.Close()
	delete(m.connections, id)
	m.emitter.Emit("connection:state:"+id, "disconnected")
	return err
}

func (m *ConnectionManager) getConnection(id string) (*ManagedConnection, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	conn, ok := m.connections[id]
	if !ok {
		return nil, errors.New("connection not found")
	}
	return conn, nil
}

func (m *ConnectionManager) WriteInput(id, data string) error {
	conn, err := m.getConnection(id)
	if err != nil {
		return err
	}
	return conn.WriteInput(data)
}

func (m *ConnectionManager) ResizePTY(id string, cols, rows int) error {
	conn, err := m.getConnection(id)
	if err != nil {
		return err
	}
	return conn.ResizePTY(cols, rows)
}

func (m *ConnectionManager) ListDir(id, path string) ([]FileEntry, error) {
	conn, err := m.getConnection(id)
	if err != nil {
		return nil, err
	}
	return conn.ListRemoteDir(path)
}

func (m *ConnectionManager) Mkdir(id, path string) error {
	conn, err := m.getConnection(id)
	if err != nil {
		return err
	}
	return conn.MkdirRemote(path)
}

func (m *ConnectionManager) Remove(id, path string) error {
	conn, err := m.getConnection(id)
	if err != nil {
		return err
	}
	return conn.RemoveRemote(path)
}

func (m *ConnectionManager) Rename(id, oldPath, newPath string) error {
	conn, err := m.getConnection(id)
	if err != nil {
		return err
	}
	return conn.RenameRemote(oldPath, newPath)
}

func (m *ConnectionManager) UploadFile(id, localPath, remotePath string) error {
	conn, err := m.getConnection(id)
	if err != nil {
		return err
	}
	return conn.CopyLocalToRemote(localPath, remotePath, m.emitter)
}

func (m *ConnectionManager) DownloadFile(id, remotePath, localPath string) error {
	conn, err := m.getConnection(id)
	if err != nil {
		return err
	}
	return conn.CopyRemoteToLocal(remotePath, localPath, m.emitter)
}

func (m *ConnectionManager) ReadRemoteFile(id, path string) (string, error) {
	conn, err := m.getConnection(id)
	if err != nil {
		return "", err
	}
	return conn.ReadRemoteFile(path)
}

func (m *ConnectionManager) GetRemoteHome(id string) (string, error) {
	conn, err := m.getConnection(id)
	if err != nil {
		return "", err
	}
	return conn.RemoteHome()
}

func (m *ConnectionManager) GetLocalHome() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return home, nil
}

func (m *ConnectionManager) ListLocalDir(path string) ([]FileEntry, error) {
	return ListLocalDir(path)
}

func (m *ConnectionManager) ReadLocalFile(path string) (string, error) {
	return ReadLocalFile(path, 512*1024)
}

func (m *ConnectionManager) CloseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for id, conn := range m.connections {
		_ = conn.Close()
		delete(m.connections, id)
	}
}
