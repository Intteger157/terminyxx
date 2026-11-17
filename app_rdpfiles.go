package main

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/wailsapp/wails/v2/pkg/runtime"

	"terminyxx/internal/connection"
	"terminyxx/internal/filesink"
	"terminyxx/internal/printing"
	"terminyxx/internal/rdpdrive"
	"terminyxx/internal/store"
)

// Files that the built-in RDP client hands over to this computer: files
// copied on the remote desktop and saved here, and documents printed to its
// virtual printer. The webview writes them in base64 chunks; it can write only
// into folders the user picked with RDPPickSaveFolder.

func (a *App) filesReady() error {
	if err := a.guard(); err != nil {
		return err
	}
	if a.files == nil {
		return errors.New("not ready")
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
	if err := a.guard(); err != nil {
		return err
	}
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

// ListLocalPrinters returns this computer's printers, the default one first.
func (a *App) ListLocalPrinters() ([]printing.Printer, error) {
	if err := a.guard(); err != nil {
		return nil, err
	}
	return printing.List()
}

// RDPPrintFinish completes a document printed on the remote desktop. Without
// commit the partial document is deleted. Otherwise, by mode:
//   - "open": the PDF opens in the default viewer (the virtual PDF printer);
//   - "pdf": the PDF is printed on printer, then deleted;
//   - "raw": the data, rendered for printer by its own driver on the server,
//     is sent to it unchanged, then deleted.
//
// If printing a PDF fails, it is opened instead so it isn't lost.
func (a *App) RDPPrintFinish(handle string, commit bool, mode, printer, title string) (string, error) {
	if a.files == nil {
		return "", errors.New("not ready")
	}
	if commit && a.guard() != nil {
		// Locked: never open or print the document; drop it.
		_, _ = a.files.Close(handle, false)
		return "", connection.ErrLocked
	}
	path, err := a.files.Close(handle, commit)
	if err != nil || !commit {
		return "", err
	}
	if title == "" {
		title = "Remote desktop document"
	}
	switch mode {
	case "pdf":
		if err := printing.PDF(printer, path, title); err != nil {
			_ = filesink.Open(path)
			return path, fmt.Errorf("%w; the document was opened instead", err)
		}
	case "raw":
		err := printing.Raw(printer, path, title)
		_ = os.Remove(path)
		return "", err
	default:
		return path, filesink.Open(path)
	}
	_ = os.Remove(path)
	return "", nil
}

// OpenPrintsFolder shows the folder with documents printed on remote desktops.
func (a *App) OpenPrintsFolder() error {
	if err := a.guard(); err != nil {
		return err
	}
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

// openDrives starts the drive session of tabID with the profile's shared
// folders (or every local drive) and returns those that will be announced,
// plus the folders that could not be opened.
func (a *App) openDrives(tabID string, paths []string, all, readOnly bool) ([]rdpdrive.Drive, []string) {
	if a.drives == nil {
		return nil, nil
	}
	if !all && len(paths) == 0 {
		a.drives.Close(tabID)
		return nil, nil
	}
	opened, failed := a.drives.Open(tabID, rdpdrive.Plan(paths, all, readOnly))
	names := make([]string, 0, len(failed))
	for _, d := range failed {
		names = append(names, d.Path)
	}
	return opened, names
}

// serveDrives answers the drive requests of tabID's built-in RDP session on
// its side channel. Paths are confined to the shared folders here; the
// webview only relays. While the app is locked, every request is refused.
func (a *App) serveDrives(tabID string, ws *websocket.Conn) {
	if a.drives == nil {
		return
	}
	s := a.drives.Get(tabID)
	if s == nil {
		return
	}
	// TERMINYXX_RDP_TRACE=1 logs every drive request to <data dir>/rdp-drives.log.
	var trace io.Writer
	if os.Getenv("TERMINYXX_RDP_TRACE") == "1" {
		if dir, err := store.DataDir(); err == nil {
			if f, err := os.OpenFile(filepath.Join(dir, "rdp-drives.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600); err == nil {
				defer f.Close()
				bw := bufio.NewWriterSize(f, 64<<10)
				defer bw.Flush()
				trace = bw
			}
		}
	}
	pulse := func() string {
		up, down, upStall, downStall, ok := a.rdpgw.Traffic(tabID)
		if !ok {
			return "gateway: no RDP session"
		}
		return fmt.Sprintf("gateway: up=%d down=%d up_write_waiting=%v down_write_waiting=%v %s",
			up, down, upStall.Round(time.Millisecond), downStall.Round(time.Millisecond), a.rdpgw.TCPInfo(tabID))
	}
	rdpdrive.Serve(s, ws, func() bool { return a.sec.lock != nil && a.sec.lock.Locked() }, trace, pulse)
}
