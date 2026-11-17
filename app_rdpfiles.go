package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"terminyxx/internal/connection"
	"terminyxx/internal/filesink"
)

// Files that the built-in RDP client hands over to this computer: files
// copied on the remote desktop and saved here, and documents printed to its
// virtual printer. The webview writes them in base64 chunks; it can write only
// into folders the user picked with RDPPickSaveFolder.

func (a *App) filesReady() error {
	if a.files == nil {
		return errors.New("not ready")
	}
	if a.sec.lock != nil && a.sec.lock.Locked() {
		return connection.ErrLocked
	}
	return nil
}

// RDPPickSaveFolder asks where to save files copied on a remote desktop. It
// returns "" if the user cancels.
func (a *App) RDPPickSaveFolder() (string, error) {
	if err := a.filesReady(); err != nil {
		return "", err
	}
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:                "Save files from the remote desktop",
		CanCreateDirectories: true,
	})
	if err != nil || dir == "" {
		return "", err
	}
	a.files.Allow(dir)
	return dir, nil
}

// RDPMakeDir creates the folder relPath (\-separated, from the server) inside dir.
func (a *App) RDPMakeDir(dir, relPath string) error {
	if err := a.filesReady(); err != nil {
		return err
	}
	return a.files.Mkdir(dir, relPath)
}

// RDPFileCreate starts the file relPath inside dir and returns a handle for
// RDPFileWrite and RDPFileClose.
func (a *App) RDPFileCreate(dir, relPath string) (string, error) {
	if err := a.filesReady(); err != nil {
		return "", err
	}
	return a.files.Create(dir, relPath)
}

// RDPFileWrite appends a base64-encoded chunk.
func (a *App) RDPFileWrite(handle, chunk string) error {
	if a.files == nil {
		return errors.New("not ready")
	}
	return a.files.WriteBase64(handle, chunk)
}

// RDPFileClose finishes a file (commit) or deletes what was written. It returns
// the final path, which has " (2)" etc. added if the name was taken.
func (a *App) RDPFileClose(handle string, commit bool) (string, error) {
	if a.files == nil {
		return "", errors.New("not ready")
	}
	return a.files.Close(handle, commit)
}

// RDPOpenSaveFolder shows a folder picked with RDPPickSaveFolder.
func (a *App) RDPOpenSaveFolder(dir string) error {
	if err := a.filesReady(); err != nil {
		return err
	}
	if !a.files.Allowed(dir) {
		return filesink.ErrNotAllowed
	}
	return filesink.Open(dir)
}

// RDPPrintCreate starts a document printed on the remote desktop (a PDF from
// the "Microsoft Print to PDF" driver) in the app's prints folder. Documents
// older than a week are deleted first.
func (a *App) RDPPrintCreate() (string, error) {
	if err := a.filesReady(); err != nil {
		return "", err
	}
	if err := os.MkdirAll(a.printsDir, 0o700); err != nil {
		return "", err
	}
	a.prunePrints(7 * 24 * time.Hour)
	name := "Printed " + time.Now().Format("2006-01-02 15-04-05") + ".pdf"
	return a.files.CreateAt(filepath.Join(a.printsDir, name), 0o600)
}

// RDPPrintFinish completes a printed document and opens it in the default PDF
// viewer, where it can be printed on a local printer or saved. Without commit
// the partial document is deleted.
func (a *App) RDPPrintFinish(handle string, commit bool) (string, error) {
	if a.files == nil {
		return "", errors.New("not ready")
	}
	path, err := a.files.Close(handle, commit)
	if err != nil || !commit {
		return "", err
	}
	if err := filesink.Open(path); err != nil {
		return path, err
	}
	return path, nil
}

// OpenPrintsFolder shows the folder with documents printed on remote desktops.
func (a *App) OpenPrintsFolder() error {
	if err := os.MkdirAll(a.printsDir, 0o700); err != nil {
		return err
	}
	return filesink.Open(a.printsDir)
}

func (a *App) prunePrints(maxAge time.Duration) {
	entries, err := os.ReadDir(a.printsDir)
	if err != nil {
		return
	}
	cutoff := time.Now().Add(-maxAge)
	for _, e := range entries {
		if e.IsDir() || !(strings.HasSuffix(e.Name(), ".pdf") || strings.HasSuffix(e.Name(), ".part")) {
			continue
		}
		if info, err := e.Info(); err == nil && info.ModTime().Before(cutoff) {
			_ = os.Remove(filepath.Join(a.printsDir, e.Name()))
		}
	}
}
