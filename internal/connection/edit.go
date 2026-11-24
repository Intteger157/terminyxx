package connection

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"unicode/utf8"
)

// maxEditBytes is the largest file the built-in editor opens.
const maxEditBytes = 2 << 20

// EditConflictPrefix marks a save refused because the file changed on the
// server after it was opened.
const EditConflictPrefix = "EDIT_CONFLICT"

// ErrNotText is returned for files the editor cannot round-trip safely.
var ErrNotText = errors.New("this file is not UTF-8 text, so it cannot be edited here")

var errEditConflict = errors.New(EditConflictPrefix + "|the file was changed on the server after you opened it")

// EditFile is a remote text file opened for editing.
type EditFile struct {
	Content string `json:"content"`
	// Version identifies the file state (modification time and size); pass it
	// back on save to detect changes made by someone else.
	Version string `json:"version"`
	Mode    string `json:"mode"`
}

func versionOf(info os.FileInfo) string {
	return fmt.Sprintf("%d:%d", info.ModTime().UnixNano(), info.Size())
}

// ReadForEdit loads a whole text file. Binary files, invalid UTF-8 (a save
// would corrupt it) and files over the size limit are refused.
func (b *SFTPBridge) ReadForEdit(p string) (EditFile, error) {
	real, err := b.client.RealPath(p)
	if err != nil {
		real = p
	}
	f, err := b.client.Open(real)
	if err != nil {
		return EditFile{}, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return EditFile{}, err
	}
	if info.IsDir() {
		return EditFile{}, errors.New("this is a folder")
	}
	if info.Size() > maxEditBytes {
		return EditFile{}, fmt.Errorf("file is larger than %d MB; download it instead", maxEditBytes>>20)
	}
	data, err := io.ReadAll(io.LimitReader(f, maxEditBytes+1))
	if err != nil {
		return EditFile{}, err
	}
	if len(data) > maxEditBytes {
		return EditFile{}, fmt.Errorf("file is larger than %d MB; download it instead", maxEditBytes>>20)
	}
	if bytes.IndexByte(data, 0) >= 0 || !utf8.Valid(data) {
		return EditFile{}, ErrNotText
	}
	return EditFile{Content: string(data), Version: versionOf(info), Mode: info.Mode().Perm().String()}, nil
}

// WriteEdited saves content. Unless force is set it first checks that the
// file still has the version the editor loaded. It publishes the staged
// contents only after writing and closing the temporary file successfully.
func (b *SFTPBridge) WriteEdited(p, content, version string, force bool) (string, error) {
	if len(content) > maxEditBytes {
		return "", fmt.Errorf("file is larger than %d MB", maxEditBytes>>20)
	}
	if strings.IndexByte(content, 0) >= 0 || !utf8.ValidString(content) {
		return "", ErrNotText
	}
	real, err := b.client.RealPath(p) // saving through a symlink edits its target
	if err != nil {
		real = p
	}
	info, err := b.client.Lstat(real)
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", errors.New("only regular files can be edited")
	}
	if !force && version != "" && versionOf(info) != version {
		return "", errEditConflict
	}

	tmp, f, err := b.openRemoteTemp(real)
	if err != nil {
		return "", fmt.Errorf("could not stage the file in its directory: %w", err)
	}
	defer func() {
		if tmp != "" {
			_ = b.client.Remove(tmp)
		}
	}()
	if err := f.Chmod(0o600); err != nil {
		if err := b.client.Chmod(tmp, 0o600); err != nil {
			_ = f.Close()
			return "", fmt.Errorf("could not protect the temporary file: %w", err)
		}
	}
	n, err := f.Write([]byte(content))
	if closeErr := f.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return "", err
	}
	if n != len(content) {
		return "", io.ErrShortWrite
	}
	current, err := b.client.Lstat(real)
	if err != nil {
		return "", err
	}
	if !current.Mode().IsRegular() || !force && versionOf(current) != versionOf(info) {
		return "", errEditConflict
	}
	if mode := current.Mode().Perm(); mode != 0 {
		if err := b.client.Chmod(tmp, mode); err != nil {
			return "", fmt.Errorf("could not preserve file permissions: %w", err)
		}
	}
	if err := b.replaceUpload(tmp, real); err != nil {
		return "", err
	}
	tmp = ""
	after, err := b.client.Stat(real)
	if err != nil {
		return "", err
	}
	return versionOf(after), nil
}

func (m *ConnectionManager) ReadForEdit(id, p string) (EditFile, error) {
	b, err := m.sftp(id)
	if err != nil {
		return EditFile{}, err
	}
	return b.ReadForEdit(p)
}

func (m *ConnectionManager) WriteEdited(id, p, content, version string, force bool) (string, error) {
	b, err := m.sftp(id)
	if err != nil {
		return "", err
	}
	return b.WriteEdited(p, content, version, force)
}
