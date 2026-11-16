package connection

import (
	"os"
	"path/filepath"
	"runtime"
)

// ListLocalDir lists a local directory. On Windows an empty path lists the
// drives, which is what "up" from a drive root leads to.
func ListLocalDir(dirPath string) ([]FileEntry, error) {
	if dirPath == "" && runtime.GOOS == "windows" {
		return listDrives(), nil
	}
	if dirPath == "" {
		dirPath = "/"
	}

	dirEntries, err := os.ReadDir(dirPath)
	if err != nil {
		return nil, err
	}
	result := make([]FileEntry, 0, len(dirEntries))
	for _, de := range dirEntries {
		full := filepath.Join(dirPath, de.Name())
		info, err := de.Info()
		if err != nil {
			continue
		}
		entry := toEntry(de.Name(), full, info)
		if info.Mode()&os.ModeSymlink != 0 {
			entry.IsLink = true
			if target, err := os.Stat(full); err == nil {
				entry.IsDir = target.IsDir()
			}
		}
		result = append(result, entry)
	}
	sortEntries(result)
	return result, nil
}

func listDrives() []FileEntry {
	var drives []FileEntry
	for c := 'A'; c <= 'Z'; c++ {
		root := string(c) + `:\`
		if _, err := os.Stat(root); err == nil {
			drives = append(drives, FileEntry{Name: string(c) + ":", Path: root, IsDir: true})
		}
	}
	return drives
}

// LocalParentDir returns the parent of p, or "" above a Windows drive root.
func LocalParentDir(p string) string {
	if p == "" {
		return ""
	}
	clean := filepath.Clean(p)
	parent := filepath.Dir(clean)
	if parent == clean {
		if runtime.GOOS == "windows" {
			return ""
		}
		return clean
	}
	return parent
}

func ReadLocalFile(filePath string) (string, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer f.Close()
	return readPreview(f)
}

func LocalMkdir(p string) error                 { return os.MkdirAll(p, 0o755) }
func LocalRemove(p string) error                { return os.RemoveAll(p) }
func LocalRename(oldPath, newPath string) error { return os.Rename(oldPath, newPath) }
