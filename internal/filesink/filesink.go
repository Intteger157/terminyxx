// Package filesink writes files that arrive from the webview in chunks: files
// copied on a remote desktop and saved here, and documents printed to the
// built-in RDP client's virtual printer.
//
// The webview names only a folder and a relative path. The folder must be one
// the user picked in a dialog this session (Allow), and the relative path
// comes from the remote server, so every part of it is checked. A file is
// written to a hidden temporary name and renamed into place only when it is
// complete; an existing file is never overwritten.
package filesink

import (
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
)

// ErrNotAllowed means the folder was not picked by the user.
var ErrNotAllowed = errors.New("this folder was not chosen for saving files")

type file struct {
	f     *os.File
	tmp   string
	final string
}

// Sink keeps the files being written and the folders the user allowed.
type Sink struct {
	mu      sync.Mutex
	files   map[string]*file
	allowed map[string]bool
	next    int
}

func New() *Sink {
	return &Sink{files: map[string]*file{}, allowed: map[string]bool{}}
}

func key(dir string) string {
	k := filepath.Clean(dir)
	if runtime.GOOS == "windows" || runtime.GOOS == "darwin" {
		k = strings.ToLower(k)
	}
	return k
}

// Allow lets files be saved into dir (a folder the user just picked).
func (s *Sink) Allow(dir string) {
	s.mu.Lock()
	s.allowed[key(dir)] = true
	s.mu.Unlock()
}

// Allowed reports whether dir was allowed with Allow.
func (s *Sink) Allowed(dir string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.allowed[key(dir)]
}

var reserved = map[string]bool{"CON": true, "PRN": true, "AUX": true, "NUL": true, "CONIN$": true, "CONOUT$": true}

func init() {
	for i := 1; i <= 9; i++ {
		reserved["COM"+strconv.Itoa(i)] = true
		reserved["LPT"+strconv.Itoa(i)] = true
	}
}

// SafeParts splits a relative path from the remote side (\ or / separated)
// into names that are safe to create on any of our platforms. It rejects
// absolute paths, drive letters, "..", control characters, characters
// Windows forbids and reserved device names.
func SafeParts(rel string) ([]string, error) {
	rel = strings.ReplaceAll(rel, `\`, "/")
	var parts []string
	for _, p := range strings.Split(rel, "/") {
		if p == "" || p == "." {
			continue
		}
		if err := checkName(p); err != nil {
			return nil, err
		}
		parts = append(parts, p)
	}
	if strings.HasPrefix(rel, "/") && len(parts) > 0 {
		return nil, fmt.Errorf("absolute path %q", rel)
	}
	return parts, nil
}

func checkName(p string) error {
	if p == ".." {
		return errors.New(`path contains ".."`)
	}
	if len(p) > 255 {
		return fmt.Errorf("name too long: %.40q…", p)
	}
	for _, r := range p {
		if r < 0x20 || r == 0x7f || strings.ContainsRune(`<>:"|?*`, r) {
			return fmt.Errorf("invalid character in %q", p)
		}
	}
	if strings.TrimRight(p, ". ") != p {
		return fmt.Errorf("name ends with a dot or space: %q", p)
	}
	base := strings.ToUpper(p)
	if i := strings.IndexByte(base, '.'); i >= 0 {
		base = base[:i]
	}
	if reserved[strings.TrimSpace(base)] {
		return fmt.Errorf("reserved name %q", p)
	}
	return nil
}

func (s *Sink) resolve(dir, rel string) (string, error) {
	if !filepath.IsAbs(dir) || !s.Allowed(dir) {
		return "", ErrNotAllowed
	}
	parts, err := SafeParts(rel)
	if err != nil {
		return "", err
	}
	return filepath.Join(append([]string{filepath.Clean(dir)}, parts...)...), nil
}

// Mkdir creates the folder rel (and its parents) inside an allowed dir.
func (s *Sink) Mkdir(dir, rel string) error {
	p, err := s.resolve(dir, rel)
	if err != nil {
		return err
	}
	return os.MkdirAll(p, 0o755)
}

// Create starts a file at rel inside an allowed dir and returns its handle.
func (s *Sink) Create(dir, rel string) (string, error) {
	p, err := s.resolve(dir, rel)
	if err != nil {
		return "", err
	}
	if filepath.Clean(p) == filepath.Clean(dir) {
		return "", errors.New("empty file name")
	}
	return s.CreateAt(p, 0o644)
}

// CreateAt starts a file at an exact path chosen by the app itself (not the
// webview), such as a printed document in the app's own folder.
func (s *Sink) CreateAt(path string, perm os.FileMode) (string, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", err
	}
	f, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".*.part")
	if err != nil {
		return "", err
	}
	_ = f.Chmod(perm)
	s.mu.Lock()
	defer s.mu.Unlock()
	s.next++
	h := strconv.Itoa(s.next)
	s.files[h] = &file{f: f, tmp: f.Name(), final: path}
	return h, nil
}

// WriteBase64 appends a base64-encoded chunk to the file.
func (s *Sink) WriteBase64(handle, chunk string) error {
	b, err := base64.StdEncoding.DecodeString(chunk)
	if err != nil {
		return err
	}
	s.mu.Lock()
	f := s.files[handle]
	s.mu.Unlock()
	if f == nil {
		return errors.New("unknown file handle")
	}
	_, err = f.f.Write(b)
	return err
}

// Close finishes the file. With commit it is moved to its final name (with
// " (2)", " (3)", … added if that name is taken) and the path is returned;
// otherwise the partial file is deleted.
func (s *Sink) Close(handle string, commit bool) (string, error) {
	s.mu.Lock()
	f := s.files[handle]
	delete(s.files, handle)
	s.mu.Unlock()
	if f == nil {
		return "", errors.New("unknown file handle")
	}
	err := f.f.Close()
	if !commit || err != nil {
		_ = os.Remove(f.tmp)
		return "", err
	}
	for i := 1; i < 1000; i++ {
		target := numbered(f.final, i)
		// Link fails if target exists, so a file that appeared meanwhile is kept.
		if err := os.Link(f.tmp, target); err == nil {
			_ = os.Remove(f.tmp)
			return target, nil
		} else if !errors.Is(err, os.ErrExist) {
			// No hard links on this file system: check, then rename.
			if _, statErr := os.Lstat(target); errors.Is(statErr, os.ErrNotExist) {
				if err := os.Rename(f.tmp, target); err != nil {
					_ = os.Remove(f.tmp)
					return "", err
				}
				return target, nil
			}
		}
	}
	_ = os.Remove(f.tmp)
	return "", errors.New("too many files with the same name")
}

// numbered returns path for i == 1, otherwise "name (i).ext".
func numbered(path string, i int) string {
	if i == 1 {
		return path
	}
	ext := filepath.Ext(path)
	base := strings.TrimSuffix(path, ext)
	if ext == path || strings.ContainsAny(ext, `/\`) {
		ext, base = "", path
	}
	return fmt.Sprintf("%s (%d)%s", base, i, ext)
}

// AbortAll drops every unfinished file (for shutdown).
func (s *Sink) AbortAll() {
	s.mu.Lock()
	files := s.files
	s.files = map[string]*file{}
	s.mu.Unlock()
	for _, f := range files {
		_ = f.f.Close()
		_ = os.Remove(f.tmp)
	}
}
