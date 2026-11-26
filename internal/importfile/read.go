// Package importfile bounds reads of files selected for import.
package importfile

import (
	"errors"
	"fmt"
	"io"
	"os"
)

const MaxSize = 16 << 20

var ErrTooLarge = errors.New("the file is too large to import")

// Read accepts ordinary files, including symlinks to them. The read itself
// stays bounded if the file grows after the size check.
func Read(path string, limit int64) ([]byte, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, errors.New("choose a regular file to import")
	}
	tooLarge := func() error {
		return fmt.Errorf("%w (limit %d MiB)", ErrTooLarge, limit>>20)
	}
	if info.Size() > limit {
		return nil, tooLarge()
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, tooLarge()
	}
	return data, nil
}
