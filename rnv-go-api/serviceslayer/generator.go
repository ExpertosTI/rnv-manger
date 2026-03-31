package serviceslayer

import (
	"crypto/rand"
	"errors"
	"math/big"
)

const (
	lowercaseChars = "abcdefghijklmnopqrstuvwxyz"
	uppercaseChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
	numberChars    = "0123456789"
	symbolChars    = "!@#$%^&*()-_=+[]{}|;:,.<>?"
)

func GeneratePassword(length int, useUppercase, useLowercase, useNumbers, useSymbols bool) (string, error) {
	if length < 8 || length > 128 {
		return "", errors.New("password length must be between 8 and 128")
	}

	var charset string
	if useLowercase {
		charset += lowercaseChars
	}
	if useUppercase {
		charset += uppercaseChars
	}
	if useNumbers {
		charset += numberChars
	}
	if useSymbols {
		charset += symbolChars
	}

	if charset == "" {
		charset = lowercaseChars + uppercaseChars + numberChars
	}

	password := make([]byte, length)
	charsetLen := big.NewInt(int64(len(charset)))

	for i := 0; i < length; i++ {
		idx, err := rand.Int(rand.Reader, charsetLen)
		if err != nil {
			return "", err
		}
		password[i] = charset[idx.Int64()]
	}

	return string(password), nil
}
