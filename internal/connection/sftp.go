package connection

import (
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"sort"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

type SFTPBridge struct {
	client *sftp.Client
}

func NewSFTPBridge(sshClient *ssh.Client) (*SFTPBridge, error) {
	client, err := sftp.NewClient(sshClient)
	if err != nil {
		return nil, fmt.Errorf("create sftp client: %w", err)
	}
	return &SFTPBridge{client: client}, nil
}

func (b *SFTPBridge) Close() error {
	return b.client.Close()
}

func (b *SFTPBridge) ListDir(dirPath string) ([]FileEntry, error) {
	entries, err := b.client.ReadDir(dirPath)
	if err != nil {
		return nil, err
	}

	result := make([]FileEntry, 0, len(entries))
	for _, entry := range entries {
		fullPath := path.Join(dirPath, entry.Name())
		result = append(result, FileEntry{
			Name:    entry.Name(),
			Path:    fullPath,
			IsDir:   entry.IsDir(),
			Size:    entry.Size(),
			ModTime: entry.ModTime().Format(time.RFC3339),
		})
	}

	sort.Slice(result, func(i, j int) bool {
		if result[i].IsDir != result[j].IsDir {
			return result[i].IsDir
		}
		return result[i].Name < result[j].Name
	})

	return result, nil
}

func (b *SFTPBridge) Mkdir(dirPath string) error {
	return b.client.Mkdir(dirPath)
}

func (b *SFTPBridge) Remove(filePath string) error {
	info, err := b.client.Stat(filePath)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return b.client.RemoveDirectory(filePath)
	}
	return b.client.Remove(filePath)
}

func (b *SFTPBridge) Rename(oldPath, newPath string) error {
	return b.client.Rename(oldPath, newPath)
}

func (b *SFTPBridge) ReadFile(filePath string, maxBytes int64) (string, error) {
	file, err := b.client.Open(filePath)
	if err != nil {
		return "", err
	}
	defer file.Close()

	limited := io.LimitReader(file, maxBytes)
	data, err := io.ReadAll(limited)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func (b *SFTPBridge) Getwd() (string, error) {
	return b.client.Getwd()
}

func (b *SFTPBridge) Download(remotePath, localPath string, emitter EventEmitter, connID string) error {
	remoteFile, err := b.client.Open(remotePath)
	if err != nil {
		return err
	}
	defer remoteFile.Close()

	info, err := remoteFile.Stat()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(localPath), 0o755); err != nil {
		return err
	}

	localFile, err := os.Create(localPath)
	if err != nil {
		return err
	}
	defer localFile.Close()

	return copyWithProgress(localFile, remoteFile, info.Size(), emitter, connID, "download", remotePath)
}

func (b *SFTPBridge) Upload(localPath, remotePath string, emitter EventEmitter, connID string) error {
	localFile, err := os.Open(localPath)
	if err != nil {
		return err
	}
	defer localFile.Close()

	info, err := localFile.Stat()
	if err != nil {
		return err
	}

	remoteFile, err := b.client.Create(remotePath)
	if err != nil {
		return err
	}
	defer remoteFile.Close()

	return copyWithProgress(remoteFile, localFile, info.Size(), emitter, connID, "upload", remotePath)
}

func copyWithProgress(dst io.Writer, src io.Reader, total int64, emitter EventEmitter, connID, operation, filePath string) error {
	buf := make([]byte, 32*1024)
	var transferred int64

	for {
		n, readErr := src.Read(buf)
		if n > 0 {
			if _, writeErr := dst.Write(buf[:n]); writeErr != nil {
				return writeErr
			}
			transferred += int64(n)
			emitter.Emit("sftp:progress:"+connID, TransferProgress{
				ConnectionID: connID,
				Operation:    operation,
				Path:         filePath,
				Transferred:  transferred,
				Total:        total,
			})
		}
		if readErr == io.EOF {
			return nil
		}
		if readErr != nil {
			return readErr
		}
	}
}

func ListLocalDir(dirPath string) ([]FileEntry, error) {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return nil, err
	}

	result := make([]FileEntry, 0, len(entries))
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			continue
		}
		fullPath := filepath.Join(dirPath, entry.Name())
		result = append(result, FileEntry{
			Name:    entry.Name(),
			Path:    fullPath,
			IsDir:   entry.IsDir(),
			Size:    info.Size(),
			ModTime: info.ModTime().Format(time.RFC3339),
		})
	}

	sort.Slice(result, func(i, j int) bool {
		if result[i].IsDir != result[j].IsDir {
			return result[i].IsDir
		}
		return result[i].Name < result[j].Name
	})

	return result, nil
}

func ReadLocalFile(filePath string, maxBytes int64) (string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, maxBytes))
	if err != nil {
		return "", err
	}
	return string(data), nil
}
