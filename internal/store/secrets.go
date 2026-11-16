package store

import (
	"errors"
	"sync"

	"github.com/zalando/go-keyring"
)

// Secrets stores passwords outside the database: Windows Credential
// Manager, macOS Keychain or the Linux Secret Service.
type Secrets interface {
	Get(key string) (string, error)
	Set(key, value string) error
	Delete(key string) error
}

// ErrSecretNotFound is returned by Get when nothing is stored for the key.
var ErrSecretNotFound = errors.New("secret not found")

const keyringService = "terminyxx"

type osKeyring struct{}

func NewOSKeyring() Secrets { return osKeyring{} }

func (osKeyring) Get(key string) (string, error) {
	v, err := keyring.Get(keyringService, key)
	if errors.Is(err, keyring.ErrNotFound) {
		return "", ErrSecretNotFound
	}
	return v, err
}

func (osKeyring) Set(key, value string) error { return keyring.Set(keyringService, key, value) }

func (osKeyring) Delete(key string) error {
	err := keyring.Delete(keyringService, key)
	if errors.Is(err, keyring.ErrNotFound) {
		return nil
	}
	return err
}

// MemorySecrets is an in-memory Secrets for tests.
type MemorySecrets struct {
	mu sync.Mutex
	m  map[string]string
}

func NewMemorySecrets() *MemorySecrets { return &MemorySecrets{m: map[string]string{}} }

func (s *MemorySecrets) Get(key string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	v, ok := s.m[key]
	if !ok {
		return "", ErrSecretNotFound
	}
	return v, nil
}

func (s *MemorySecrets) Set(key, value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.m[key] = value
	return nil
}

func (s *MemorySecrets) Delete(key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.m, key)
	return nil
}

func sshSecretKey(id string) string { return "ssh:" + id }
