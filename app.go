package main

import (
	"context"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"terminyxx/internal/connection"
	"terminyxx/internal/rdp"
	"terminyxx/internal/store"
)

type WailsEmitter struct {
	ctx context.Context
}

func (e *WailsEmitter) Emit(event string, data ...interface{}) {
	runtime.EventsEmit(e.ctx, event, data...)
}

type App struct {
	ctx     context.Context
	connMgr *connection.ConnectionManager
	data    *store.Store
	rdp     rdp.Launcher
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	dataStore, err := store.New()
	if err != nil {
		runtime.LogError(ctx, "failed to init store: "+err.Error())
	} else {
		a.data = dataStore
	}

	a.connMgr = connection.NewConnectionManager(&WailsEmitter{ctx: ctx})
	a.rdp = rdp.NewLauncher()
}

func (a *App) shutdown(ctx context.Context) {
	if a.connMgr != nil {
		a.connMgr.CloseAll()
	}
	if a.data != nil {
		_ = a.data.Close()
	}
}

// SSH bindings

func (a *App) SSHConnect(req connection.ConnectRequest) error {
	return a.connMgr.Connect(req)
}

func (a *App) SSHDisconnect(id string) error {
	return a.connMgr.Disconnect(id)
}

func (a *App) SSHWriteInput(id, data string) error {
	return a.connMgr.WriteInput(id, data)
}

func (a *App) SSHResizePTY(id string, cols, rows int) error {
	return a.connMgr.ResizePTY(id, cols, rows)
}

func (a *App) SFTPListDir(id, path string) ([]connection.FileEntry, error) {
	return a.connMgr.ListDir(id, path)
}

func (a *App) SFTPMkdir(id, path string) error {
	return a.connMgr.Mkdir(id, path)
}

func (a *App) SFTPRemove(id, path string) error {
	return a.connMgr.Remove(id, path)
}

func (a *App) SFTPRename(id, oldPath, newPath string) error {
	return a.connMgr.Rename(id, oldPath, newPath)
}

func (a *App) SFTPUpload(id, localPath, remotePath string) error {
	return a.connMgr.UploadFile(id, localPath, remotePath)
}

func (a *App) SFTPDownload(id, remotePath, localPath string) error {
	return a.connMgr.DownloadFile(id, remotePath, localPath)
}

func (a *App) SFTPReadFile(id, path string) (string, error) {
	return a.connMgr.ReadRemoteFile(id, path)
}

func (a *App) GetRemoteHome(id string) (string, error) {
	return a.connMgr.GetRemoteHome(id)
}

func (a *App) GetLocalHome() (string, error) {
	return a.connMgr.GetLocalHome()
}

func (a *App) ListLocalDir(path string) ([]connection.FileEntry, error) {
	return a.connMgr.ListLocalDir(path)
}

func (a *App) ReadLocalFile(path string) (string, error) {
	return a.connMgr.ReadLocalFile(path)
}

// Profile store bindings

func (a *App) ListSSHProfiles() ([]store.SSHProfile, error) {
	if a.data == nil {
		return []store.SSHProfile{}, nil
	}
	return a.data.ListSSHProfiles()
}

func (a *App) SaveSSHProfile(profile store.SSHProfile) error {
	if a.data == nil {
		return nil
	}
	return a.data.SaveSSHProfile(profile)
}

func (a *App) DeleteSSHProfile(id string) error {
	if a.data == nil {
		return nil
	}
	return a.data.DeleteSSHProfile(id)
}

func (a *App) ListRDPProfiles() ([]rdp.RDPProfile, error) {
	if a.data == nil {
		return []rdp.RDPProfile{}, nil
	}
	return a.data.ListRDPProfiles()
}

func (a *App) SaveRDPProfile(profile rdp.RDPProfile) error {
	if a.data == nil {
		return nil
	}
	return a.data.SaveRDPProfile(profile)
}

func (a *App) DeleteRDPProfile(id string) error {
	if a.data == nil {
		return nil
	}
	return a.data.DeleteRDPProfile(id)
}

func (a *App) LaunchRDP(profileID string) error {
	if a.data == nil {
		return nil
	}
	profile, err := a.data.GetRDPProfile(profileID)
	if err != nil {
		return err
	}
	return a.rdp.Launch(profile)
}
