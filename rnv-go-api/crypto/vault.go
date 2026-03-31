package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"io"
)

// Encrypt encrypts plaintext using AES-256-GCM with the given hex-encoded key.
// Returns base64(nonce || ciphertext || tag).
func Encrypt(plaintext, hexKey string) (string, error) {
	if plaintext == "" {
		return "", nil
	}

	key, err := hex.DecodeString(hexKey)
	if err != nil {
		return "", errors.New("invalid vault master key: must be hex-encoded")
	}
	if len(key) != 32 {
		return "", errors.New("invalid vault master key: must be 32 bytes (64 hex chars)")
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decrypts base64(nonce || ciphertext || tag) using AES-256-GCM.
func Decrypt(encoded, hexKey string) (string, error) {
	if encoded == "" {
		return "", nil
	}

	key, err := hex.DecodeString(hexKey)
	if err != nil {
		return "", errors.New("invalid vault master key")
	}
	if len(key) != 32 {
		return "", errors.New("invalid vault master key: must be 32 bytes")
	}

	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", errors.New("invalid encrypted data")
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", errors.New("ciphertext too short")
	}

	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", errors.New("decryption failed: invalid key or corrupted data")
	}

	return string(plaintext), nil
}

// RotateField re-encrypts a field from oldKey to newKey.
func RotateField(encoded, oldHexKey, newHexKey string) (string, error) {
	if encoded == "" {
		return "", nil
	}
	plaintext, err := Decrypt(encoded, oldHexKey)
	if err != nil {
		return "", err
	}
	return Encrypt(plaintext, newHexKey)
}
