package main

import (
	"errors"

	"terminyxx/internal/connection"
	"terminyxx/internal/sshkeys"
)

// SSH key manager bindings (Settings → SSH keys).

// ListSSHKeys lists the private keys in ~/.ssh.
func (a *App) ListSSHKeys() ([]sshkeys.Key, error) {
	if err := a.guard(); err != nil {
		return nil, err
	}
	dir, err := sshkeys.Dir()
	if err != nil {
		return nil, err
	}
	return sshkeys.List(dir)
}

// GenerateSSHKey creates an Ed25519 key pair ~/.ssh/<name>(.pub). It never
// overwrites an existing file.
func (a *App) GenerateSSHKey(name, comment, passphrase string) (sshkeys.Key, error) {
	if err := a.guard(); err != nil {
		return sshkeys.Key{}, err
	}
	if passphrase != "" && len(passphrase) < 5 {
		return sshkeys.Key{}, errors.New("use a passphrase of at least 5 characters, or none")
	}
	dir, err := sshkeys.Dir()
	if err != nil {
		return sshkeys.Key{}, err
	}
	return sshkeys.Generate(dir, name, comment, passphrase)
}

// ListAgentKeys lists the keys loaded in the local ssh-agent.
func (a *App) ListAgentKeys() (connection.AgentStatus, error) {
	if err := a.guard(); err != nil {
		return connection.AgentStatus{}, err
	}
	return connection.ListAgentKeys()
}

// InstallPublicKey adds the public key of the key file at keyPath to
// ~/.ssh/authorized_keys on the server of connection id. It returns false
// when the server already had it.
func (a *App) InstallPublicKey(id, keyPath string) (bool, error) {
	if err := a.guard(); err != nil {
		return false, err
	}
	line, err := sshkeys.PublicLine(keyPath)
	if err != nil {
		return false, err
	}
	return a.connMgr.InstallPublicKey(id, line)
}
