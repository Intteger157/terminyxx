package store

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"strings"
	"sync"
)

// ErrSecretLocked is returned while a master password is set but the app has
// not been unlocked with it yet, so saved passwords cannot be read or written.
var ErrSecretLocked = errors.New("saved passwords are locked: unlock the app with the master password")

const sealedPrefix = "enc1:"

// Vault wraps the OS keychain. While a master password is set every value is
// sealed with AES-256-GCM under a random data key before it reaches the
// keychain, so another program that reads the keychain only gets ciphertext.
// The data key is itself wrapped with a key derived from the master password
// (see security.Lock) and lives in memory only after an unlock.
//
// Without a master password the values are stored as they are.
type Vault struct {
	inner Secrets

	mu       sync.RWMutex
	ready    bool // SetEnabled has been called
	enabled  bool
	migrated bool
	dek      []byte
	keys     func() ([]string, error)
}

func NewVault(inner Secrets) *Vault { return &Vault{inner: inner} }

// SetKeyLister tells the vault how to enumerate stored secret keys, which a
// re-seal needs. The store provides it once it is open.
func (v *Vault) SetKeyLister(f func() ([]string, error)) {
	v.mu.Lock()
	v.keys = f
	v.mu.Unlock()
}

// SetEnabled records whether new and existing values are sealed.
func (v *Vault) SetEnabled(on bool) {
	v.mu.Lock()
	v.ready = true
	v.enabled = on
	v.mu.Unlock()
}

func (v *Vault) Enabled() bool {
	v.mu.RLock()
	defer v.mu.RUnlock()
	return v.enabled
}

// HasKey reports whether the data key is in memory.
func (v *Vault) HasKey() bool {
	v.mu.RLock()
	defer v.mu.RUnlock()
	return v.dek != nil
}

// Unseal keeps the data key in memory (after the master password unlock).
func (v *Vault) Unseal(dek []byte) {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.wipe()
	v.dek = append([]byte(nil), dek...)
}

// Seal drops the data key from memory.
func (v *Vault) Seal() {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.wipe()
}

func (v *Vault) wipe() {
	for i := range v.dek {
		v.dek[i] = 0
	}
	v.dek = nil
}

// Enable seals every stored value under dek and turns sealing on.
func (v *Vault) Enable(dek []byte) error {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.wipe()
	v.dek = append([]byte(nil), dek...)
	if err := v.rewrite(true); err != nil {
		v.wipe()
		return err
	}
	v.enabled = true
	v.migrated = true
	return nil
}

// Migrate seals entries left in plaintext by earlier versions with a vault.
func (v *Vault) Migrate() error {
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.migrated {
		return nil
	}
	if err := v.rewrite(true); err != nil {
		return err
	}
	v.migrated = true
	return nil
}

// Disable opens every stored value again and turns sealing off. The data key
// must be loaded.
func (v *Vault) Disable() error {
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.dek == nil {
		return ErrSecretLocked
	}
	if err := v.rewrite(false); err != nil {
		return err
	}
	v.enabled = false
	v.migrated = false
	return nil
}

// rewrite converts all stored values. Callers hold v.mu.
func (v *Vault) rewrite(seal bool) error {
	if v.keys == nil {
		return nil
	}
	keys, err := v.keys()
	if err != nil {
		return err
	}
	for _, k := range keys {
		raw, err := v.inner.Get(k)
		if errors.Is(err, ErrSecretNotFound) {
			continue
		}
		if err != nil {
			return err
		}
		if seal && strings.HasPrefix(raw, sealedPrefix) {
			continue
		}
		plain, err := v.open(k, raw)
		if err != nil {
			return err
		}
		out := plain
		if seal {
			if out, err = v.seal(k, plain); err != nil {
				return err
			}
		}
		if out != raw {
			if err := v.inner.Set(k, out); err != nil {
				return err
			}
		}
	}
	return nil
}

func (v *Vault) aead() (cipher.AEAD, error) {
	if v.dek == nil {
		return nil, ErrSecretLocked
	}
	b, err := aes.NewCipher(v.dek)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(b)
}

// seal encrypts value; the key name is authenticated so a sealed value cannot
// be moved to another entry.
func (v *Vault) seal(key, value string) (string, error) {
	g, err := v.aead()
	if err != nil {
		return "", err
	}
	nonce := make([]byte, g.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	ct := g.Seal(nonce, nonce, []byte(value), []byte(key))
	return sealedPrefix + base64.StdEncoding.EncodeToString(ct), nil
}

// open returns the plain value of raw, which may be sealed or plain.
func (v *Vault) open(key, raw string) (string, error) {
	if !strings.HasPrefix(raw, sealedPrefix) {
		return raw, nil
	}
	g, err := v.aead()
	if err != nil {
		return "", err
	}
	ct, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(raw, sealedPrefix))
	if err != nil || len(ct) < g.NonceSize() {
		return "", errors.New("stored password is corrupt")
	}
	pt, err := g.Open(nil, ct[:g.NonceSize()], ct[g.NonceSize():], []byte(key))
	if err != nil {
		return "", errors.New("stored password could not be decrypted")
	}
	return string(pt), nil
}

func (v *Vault) Get(key string) (string, error) {
	v.mu.RLock()
	defer v.mu.RUnlock()
	if v.enabled && v.dek == nil {
		return "", ErrSecretLocked
	}
	raw, err := v.inner.Get(key)
	if err != nil {
		return "", err
	}
	return v.open(key, raw)
}

// Has reports whether an entry exists without needing the data key.
func (v *Vault) Has(key string) bool {
	_, err := v.inner.Get(key)
	return err == nil
}

func (v *Vault) Set(key, value string) error {
	v.mu.RLock()
	defer v.mu.RUnlock()
	if !v.ready {
		// Startup: whether a master password exists is not known yet, and a
		// value written now could end up unsealed.
		return ErrSecretLocked
	}
	if v.enabled {
		sealed, err := v.seal(key, value)
		if err != nil {
			return err
		}
		return v.inner.Set(key, sealed)
	}
	return v.inner.Set(key, value)
}

func (v *Vault) Delete(key string) error { return v.inner.Delete(key) }
