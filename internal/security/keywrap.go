package security

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// The saved-password data key is random; it is stored only wrapped with a key
// derived from the master password (Argon2id with its own salt), as
// "dek1$<salt>$<nonce|ciphertext>".
const wrapPrefix = "dek1"

var errBadWrap = errors.New("stored key is corrupt")

func newDEK() ([]byte, error) {
	k := make([]byte, 32)
	_, err := rand.Read(k)
	return k, err
}

func kek(password string, salt []byte) []byte {
	return argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, 32)
}

func wrapDEK(password string, dek []byte) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	b, err := aes.NewCipher(kek(password, salt))
	if err != nil {
		return "", err
	}
	g, err := cipher.NewGCM(b)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, g.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	ct := g.Seal(nonce, nonce, dek, []byte(wrapPrefix))
	e := base64.RawStdEncoding
	return fmt.Sprintf("%s$%s$%s", wrapPrefix, e.EncodeToString(salt), e.EncodeToString(ct)), nil
}

func unwrapDEK(password, blob string) ([]byte, error) {
	parts := strings.Split(blob, "$")
	if len(parts) != 3 || parts[0] != wrapPrefix {
		return nil, errBadWrap
	}
	e := base64.RawStdEncoding
	salt, err1 := e.DecodeString(parts[1])
	ct, err2 := e.DecodeString(parts[2])
	if err1 != nil || err2 != nil {
		return nil, errBadWrap
	}
	b, err := aes.NewCipher(kek(password, salt))
	if err != nil {
		return nil, err
	}
	g, err := cipher.NewGCM(b)
	if err != nil {
		return nil, err
	}
	if len(ct) < g.NonceSize() {
		return nil, errBadWrap
	}
	dek, err := g.Open(nil, ct[:g.NonceSize()], ct[g.NonceSize():], []byte(wrapPrefix))
	if err != nil {
		return nil, ErrWrongPassword
	}
	return dek, nil
}
