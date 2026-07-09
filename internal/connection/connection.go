package connection

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

type ManagedConnection struct {
	mu        sync.RWMutex
	ID        string
	Config    ConnectRequest
	client    *ssh.Client
	pty       *PTYSession
	sftp      *SFTPBridge
	state     ConnectionState
	createdAt time.Time
	cancel    context.CancelFunc
}

func (c *ManagedConnection) State() ConnectionState {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.state
}

func (c *ManagedConnection) EnsureSFTP() (*SFTPBridge, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.sftp != nil {
		return c.sftp, nil
	}
	if c.client == nil {
		return nil, errors.New("not connected")
	}

	bridge, err := NewSFTPBridge(c.client)
	if err != nil {
		return nil, err
	}
	c.sftp = bridge
	return c.sftp, nil
}

func (c *ManagedConnection) WriteInput(data string) error {
	c.mu.RLock()
	pty := c.pty
	c.mu.RUnlock()

	if pty == nil {
		return errors.New("pty session not active")
	}
	_, err := pty.Write([]byte(data))
	return err
}

func (c *ManagedConnection) ResizePTY(cols, rows int) error {
	c.mu.RLock()
	pty := c.pty
	c.mu.RUnlock()

	if pty == nil {
		return errors.New("pty session not active")
	}
	return pty.Resize(cols, rows)
}

func (c *ManagedConnection) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.cancel != nil {
		c.cancel()
	}
	if c.pty != nil {
		_ = c.pty.Close()
		c.pty = nil
	}
	if c.sftp != nil {
		_ = c.sftp.Close()
		c.sftp = nil
	}
	if c.client != nil {
		err := c.client.Close()
		c.client = nil
		c.state = StateDisconnected
		return err
	}
	c.state = StateDisconnected
	return nil
}

func buildSSHConfig(req ConnectRequest) (*ssh.ClientConfig, error) {
	var auths []ssh.AuthMethod

	switch req.AuthType {
	case "key":
		keyData, err := os.ReadFile(req.KeyPath)
		if err != nil {
			return nil, fmt.Errorf("read key file: %w", err)
		}
		signer, err := ssh.ParsePrivateKey(keyData)
		if err != nil {
			return nil, fmt.Errorf("parse private key: %w", err)
		}
		auths = append(auths, ssh.PublicKeys(signer))
	default:
		auths = append(auths, ssh.Password(req.Password))
	}

	// TODO: replace with known_hosts verification in Phase 5
	return &ssh.ClientConfig{
		User:            req.Username,
		Auth:            auths,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         15 * time.Second,
	}, nil
}

func dialSSH(req ConnectRequest) (*ssh.Client, error) {
	config, err := buildSSHConfig(req)
	if err != nil {
		return nil, err
	}

	port := req.Port
	if port == 0 {
		port = 22
	}

	addr := fmt.Sprintf("%s:%d", req.Host, port)
	return ssh.Dial("tcp", addr, config)
}

func newManagedConnection(req ConnectRequest, emitter EventEmitter) (*ManagedConnection, error) {
	_, cancel := context.WithCancel(context.Background())

	conn := &ManagedConnection{
		ID:        req.ID,
		Config:    req,
		state:     StateConnecting,
		createdAt: time.Now(),
		cancel:    cancel,
	}

	client, err := dialSSH(req)
	if err != nil {
		cancel()
		return nil, err
	}
	conn.client = client

	pty, err := NewPTYSession(client, emitter, req.ID, 120, 30)
	if err != nil {
		_ = client.Close()
		cancel()
		return nil, err
	}
	conn.pty = pty
	conn.state = StateConnected

	return conn, nil
}

func (c *ManagedConnection) SFTPOrError() (*SFTPBridge, error) {
	bridge, err := c.EnsureSFTP()
	if err != nil {
		return nil, err
	}
	return bridge, nil
}

func (c *ManagedConnection) IsClosed() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.state == StateDisconnected && c.client == nil
}

func (c *ManagedConnection) RemoteHome() (string, error) {
	bridge, err := c.SFTPOrError()
	if err != nil {
		return "", err
	}
	return bridge.Getwd()
}

func (c *ManagedConnection) CopyLocalToRemote(localPath, remotePath string, emitter EventEmitter) error {
	bridge, err := c.SFTPOrError()
	if err != nil {
		return err
	}
	return bridge.Upload(localPath, remotePath, emitter, c.ID)
}

func (c *ManagedConnection) CopyRemoteToLocal(remotePath, localPath string, emitter EventEmitter) error {
	bridge, err := c.SFTPOrError()
	if err != nil {
		return err
	}
	return bridge.Download(remotePath, localPath, emitter, c.ID)
}

func (c *ManagedConnection) ReadRemoteFile(filePath string) (string, error) {
	bridge, err := c.SFTPOrError()
	if err != nil {
		return "", err
	}
	return bridge.ReadFile(filePath, 512*1024)
}

func (c *ManagedConnection) ListRemoteDir(dirPath string) ([]FileEntry, error) {
	bridge, err := c.SFTPOrError()
	if err != nil {
		return nil, err
	}
	return bridge.ListDir(dirPath)
}

func (c *ManagedConnection) MkdirRemote(dirPath string) error {
	bridge, err := c.SFTPOrError()
	if err != nil {
		return err
	}
	return bridge.Mkdir(dirPath)
}

func (c *ManagedConnection) RemoveRemote(filePath string) error {
	bridge, err := c.SFTPOrError()
	if err != nil {
		return err
	}
	return bridge.Remove(filePath)
}

func (c *ManagedConnection) RenameRemote(oldPath, newPath string) error {
	bridge, err := c.SFTPOrError()
	if err != nil {
		return err
	}
	return bridge.Rename(oldPath, newPath)
}

func (c *ManagedConnection) WriteInputSafe(data string) error {
	if data == "" {
		return nil
	}
	return c.WriteInput(data)
}

func (c *ManagedConnection) Client() *ssh.Client {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.client
}

func (c *ManagedConnection) PTYActive() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.pty != nil
}

func (c *ManagedConnection) Stdin() io.WriteCloser {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.pty == nil {
		return nil
	}
	return nil
}
