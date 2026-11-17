// Package syncfile seals data into a passphrase-encrypted file that is safe
// to keep in a cloud folder or a git repository. The passphrase never leaves
// the machine; the key is derived with Argon2id and the data is encrypted
// and authenticated with AES-256-GCM.
package syncfile

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/binary"
	"errors"
	"fmt"

	"golang.org/x/crypto/argon2"
)

var magic = []byte("TXSYNC1\n")

// ErrBadPassphrase is returned when decryption fails: the passphrase is wrong
// or the file was modified.
var ErrBadPassphrase = errors.New("wrong passphrase or damaged file")

const (
	saltLen    = 16
	nonceLen   = 12
	keyLen     = 32
	timeCost   = 3
	memoryKiB  = 64 * 1024
	threads    = 4
	minPassLen = 8
)

// Layout: magic | time(4) | memory KiB(4) | threads(1) | salt(16) | nonce(12) | ciphertext.
// Everything before the ciphertext is authenticated as additional data.
const headerLen = 8 + 4 + 4 + 1 + saltLen + nonceLen

// Seal encrypts plaintext with the passphrase.
func Seal(plaintext []byte, passphrase string) ([]byte, error) {
	if len(passphrase) < minPassLen {
		return nil, fmt.Errorf("passphrase must be at least %d characters", minPassLen)
	}
	salt := make([]byte, saltLen)
	nonce := make([]byte, nonceLen)
	if _, err := rand.Read(salt); err != nil {
		return nil, err
	}
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	gcm, err := newGCM(passphrase, salt, timeCost, memoryKiB, threads)
	if err != nil {
		return nil, err
	}
	var hdr bytes.Buffer
	hdr.Write(magic)
	_ = binary.Write(&hdr, binary.BigEndian, uint32(timeCost))
	_ = binary.Write(&hdr, binary.BigEndian, uint32(memoryKiB))
	hdr.WriteByte(threads)
	hdr.Write(salt)
	hdr.Write(nonce)
	header := hdr.Bytes()
	return gcm.Seal(append([]byte(nil), header...), nonce, plaintext, header), nil
}

// Open decrypts data produced by Seal.
func Open(data []byte, passphrase string) ([]byte, error) {
	if len(data) < headerLen+16 || !bytes.HasPrefix(data, magic) {
		return nil, errors.New("not a Terminyxx sync file")
	}
	p := len(magic)
	t := binary.BigEndian.Uint32(data[p:])
	m := binary.BigEndian.Uint32(data[p+4:])
	th := data[p+8]
	// Refuse absurd parameters from a hostile file (memory exhaustion).
	if t < 1 || t > 10 || m < 8*1024 || m > 512*1024 || th < 1 || th > 16 {
		return nil, errors.New("unsupported sync file parameters")
	}
	salt := data[p+9 : p+9+saltLen]
	nonce := data[p+9+saltLen : headerLen]
	gcm, err := newGCM(passphrase, salt, t, m, th)
	if err != nil {
		return nil, err
	}
	plain, err := gcm.Open(nil, nonce, data[headerLen:], data[:headerLen])
	if err != nil {
		return nil, ErrBadPassphrase
	}
	return plain, nil
}

func newGCM(passphrase string, salt []byte, t, m uint32, th uint8) (cipher.AEAD, error) {
	key := argon2.IDKey([]byte(passphrase), salt, t, m, th, keyLen)
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
