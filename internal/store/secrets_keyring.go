//go:build !darwin || !cgo

package store

import (
	"errors"

	"github.com/zalando/go-keyring"
)

type osKeyring struct{}

// NewOSKeyring: Windows Credential Manager or the Linux Secret Service.
// (macOS uses the native Keychain API, see secrets_darwin.go.)
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

