package connection

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"time"
	"unicode/utf8"
)

// maxEditBytes is the largest file the built-in editor opens.
const maxEditBytes = 2 << 20

// EditConflictPrefix marks a save refused because the file changed on the
// server after it was opened.
const EditConflictPrefix = "EDIT_CONFLICT"

// ErrNotText is returned for files the editor cannot round-trip safely.
var ErrNotText = errors.New("this file is not UTF-8 text, so it cannot be edited here")

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
// file still has the version the editor loaded. The data goes to a temporary
// file that then replaces the original, so a dropped connection never leaves
// a half-written file; if the directory is not writable it falls back to
// overwriting in place. It returns the new version.
func (b *SFTPBridge) WriteEdited(p, content, version string, force bool) (string, error) {
	real, err := b.client.RealPath(p) // saving through a symlink edits its target
	if err != nil {
		real = p
	}
	info, err := b.client.Stat(real)
	if err != nil {
		return "", err
	}
	if !force && version != "" && versionOf(info) != version {
		return "", fmt.Errorf("%s|the file was changed on the server after you opened it", EditConflictPrefix)
	}

	tmp := path.Join(path.Dir(real), fmt.Sprintf(".%s.terminyxx-%d.tmp", path.Base(real), time.Now().UnixNano()))
	if err := b.writeFile(tmp, content, info.Mode().Perm(), true); err == nil {
		if err := b.client.PosixRename(tmp, real); err != nil {
			if err := b.client.Rename(tmp, real); err != nil {
				_ = b.client.Remove(tmp)
				return "", err
			}
		}
	} else {
		_ = b.client.Remove(tmp)
		if err := b.writeFile(real, content, 0, false); err != nil {
			return "", err
		}
	}
	after, err := b.client.Stat(real)
	if err != nil {
		return "", err
	}
	return versionOf(after), nil
}

func (b *SFTPBridge) writeFile(p, content string, mode os.FileMode, create bool) error {
	flags := os.O_WRONLY | os.O_TRUNC
	if create {
		flags |= os.O_CREATE | os.O_EXCL
	}
	f, err := b.client.OpenFile(p, flags)
	if err != nil {
		return err
	}
	if _, err := f.Write([]byte(content)); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	if create && mode != 0 {
		_ = b.client.Chmod(p, mode)
	}
	return nil
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
