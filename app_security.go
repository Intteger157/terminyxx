package main

import (
	"errors"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"terminyxx/internal/connection"
	"terminyxx/internal/rdpgw"
	"terminyxx/internal/security"
	"terminyxx/internal/store"
)

// lockHashKey keeps the master password's Argon2id hash in the settings
// table, apart from the settings JSON the frontend reads and writes.
const lockHashKey = "lock.hash"

// securityState is the App's share of the security features.
type securityState struct {
	mu   sync.RWMutex
	cfg  security.SecurityConfig
	lock *security.Lock
	clip *security.ClipboardGuard
}

type settingsHashStore struct{ data *store.Store }

func (s settingsHashStore) Load() (string, error) {
	if s.data == nil {
		return "", nil
	}
	return s.data.GetSetting(lockHashKey)
}

func (s settingsHashStore) Save(hash string) error {
	if s.data == nil {
		return errors.New("storage unavailable")
	}
	return s.data.SetSetting(lockHashKey, hash)
}

// lockWrapKey keeps the saved-password data key, wrapped with the master
// password, next to the hash.
const lockWrapKey = "lock.dek"

func (s settingsHashStore) LoadWrap() (string, error) {
	if s.data == nil {
		return "", nil
	}
	return s.data.GetSetting(lockWrapKey)
}

func (s settingsHashStore) SaveWrap(blob string) error {
	if s.data == nil {
		return errors.New("storage unavailable")
	}
	return s.data.SetSetting(lockWrapKey, blob)
}

// initSecurity runs during startup, after the store and connection manager
// exist. With a master password set, the app starts locked.
func (a *App) initSecurity() {
	raw := ""
	if a.data != nil {
		raw, _ = a.data.GetSetting(settingsKey)
	}
	a.applySecurity(security.FromSettingsJSON(raw))

	lock, err := security.NewLock(settingsHashStore{a.data}, a.onLockChange)
	if err != nil {
		runtime.LogError(a.ctx, "lock: "+err.Error())
	}
	a.sec.lock = lock
	if a.vault != nil && a.data != nil {
		hs := settingsHashStore{a.data}
		keep := func() bool { return a.securityConfig().Lock.Biometrics }
		if err := lock.AttachVault(a.vault, hs, keep); err != nil {
			runtime.LogError(a.ctx, "vault: "+err.Error())
		}
		if !lock.Locked() {
			a.data.MoveLegacyPasswords()
		}
	}
	a.connMgr.SetLocked(lock.Locked())

	a.sec.clip = security.NewClipboardGuard(
		func() (string, error) { return runtime.ClipboardGetText(a.ctx) },
		func(s string) error { return runtime.ClipboardSetText(a.ctx, s) },
		func() { runtime.EventsEmit(a.ctx, "clipboard:cleared") },
	)
	go a.watchLockTriggers()
}

func (a *App) applySecurity(cfg security.SecurityConfig) {
	a.sec.mu.Lock()
	a.sec.cfg = cfg
	a.sec.mu.Unlock()
	if a.connMgr != nil {
		a.connMgr.SetPolicy(connection.Policy{
			MaskOutput:           cfg.Masking.Enabled,
			MaskIPs:              cfg.Masking.MaskIPs,
			StrictAlgorithms:     cfg.SSH.ModernAlgorithmsOnly,
			AllowAgentForwarding: cfg.SSH.AllowAgentForwarding,
		})
	}
	connection.SetAgentSource(cfg.SSH.Agent, cfg.SSH.AgentPath)
}

func (a *App) securityConfig() security.SecurityConfig {
	a.sec.mu.RLock()
	defer a.sec.mu.RUnlock()
	return a.sec.cfg
}

// onLockChange pauses or resumes terminal output and tells the UI.
func (a *App) onLockChange(locked bool) {
	a.connMgr.SetLocked(locked)
	runtime.EventsEmit(a.ctx, "app:lock", a.sec.lock.Status())
}

// watchLockTriggers locks the app when the window is minimized or the
// computer has been asleep, if "lock on minimize / sleep" is on.
// Inactivity is tracked by the frontend, which sees the input events.
func (a *App) watchLockTriggers() {
	const tick = 2 * time.Second
	t := time.NewTicker(tick)
	defer t.Stop()
	// Wall-clock time (no monotonic reading): it keeps running while the
	// machine sleeps, so a large gap between ticks means it slept.
	last := time.Now().Round(0)
	for {
		select {
		case <-a.stop:
			return
		case <-t.C:
			now := time.Now().Round(0)
			slept := now.Sub(last) > 30*time.Second
			last = now
			if !a.securityConfig().Lock.LockOnMinimize || a.sec.lock.Locked() || !a.sec.lock.Status().Configured {
				continue
			}
			if slept || runtime.WindowIsMinimised(a.ctx) {
				a.sec.lock.LockNow()
			}
		}
	}
}

// guard refuses a call while the app is locked. Every exported App method
// (the ones the webview can call) starts with it, except those in
// openWhileLocked; TestLockedBindings enforces that, so a new binding can't
// be forgotten.
func (a *App) guard() error {
	if a.sec.lock != nil && a.sec.lock.Locked() {
		return connection.ErrLocked
	}
	return nil
}

// openWhileLocked lists the bindings that work on the lock screen: unlocking
// itself, reading the settings the lock screen needs (theme), and calls that
// only close, cancel or resize something that already exists. None of them
// reads or changes hosts, files, passwords or security settings.
var openWhileLocked = map[string]string{
	"GetLockStatus":        "lock screen",
	"LockApp":              "lock screen",
	"UnlockApp":            "lock screen",
	"UnlockWithBiometrics": "lock screen",
	"GetBiometrics":        "lock screen",
	"TestBiometrics":       "only shows the OS prompt",
	"SetMasterPassword":    "requires the current master password",
	"VerifyMasterPassword": "throttled password check",
	"GetSettings":          "the lock screen is themed before unlocking",
	"AppVersion":           "static",
	"CheckForUpdate":       "no local data",
	"SetCaptureProtection": "applied at startup",
	"GetScreenSharing":     "no local data",
	"ClipboardWrite":       "write only, auto-clear",
	"SSHDisconnect":        "closes a session",
	"SSHStartShell":        "output is held back by the gate",
	"SSHResizePTY":         "resize only",
	"StopTunnel":           "closes a forward",
	"StopRecording":        "stops a recording",
	"IsRecording":          "a flag",
	"SFTPCancelTransfer":   "cancels a job",
	"SFTPCancelDragOut":    "cancels a job",
	"RDPClose":             "closes a session",
	"RDPLastError":         "error text of this tab",
	"RDPFileClose":         "finishes or deletes a file already started",
	"RDPPrintFinish":       "refuses to open or print while locked, but discards",
	"LocalParentDir":       "string manipulation",
	"ListImportSources":    "static list",
}

// Lock bindings

// GetLockStatus reports whether a master password is set and the app is locked.
func (a *App) GetLockStatus() security.LockStatus {
	return a.sec.lock.Status()
}

// LockApp locks the app now (Ctrl+Shift+L, auto-lock). Returns false when
// no master password is set.
func (a *App) LockApp() bool {
	return a.sec.lock.LockNow()
}

// UnlockApp unlocks with the master password.
func (a *App) UnlockApp(password string) error {
	if err := a.sec.lock.Unlock(password); err != nil {
		return err
	}
	if a.data != nil {
		a.data.MoveLegacyPasswords()
	}
	return nil
}

// UnlockWithBiometrics shows the Touch ID / Windows Hello prompt and
// unlocks once it succeeds. It requires the biometrics setting.
func (a *App) UnlockWithBiometrics() error {
	if !a.securityConfig().Lock.Biometrics {
		return errors.New("biometric unlock is turned off")
	}
	if !a.sec.lock.Status().Configured {
		return security.ErrNotConfigured
	}
	if a.vault != nil && a.vault.Enabled() && !a.vault.HasKey() {
		// Saved passwords are sealed under the master password, which is
		// needed once after each start.
		return errors.New("enter the master password once after starting the app")
	}
	if err := security.VerifyUser("Unlock Terminyxx", 0); err != nil {
		return err
	}
	a.sec.lock.UnlockVerified()
	return nil
}

// GetBiometrics describes the biometric unlock this system offers.
func (a *App) GetBiometrics() security.BiometricInfo {
	return security.Biometrics()
}

// TestBiometrics runs the OS prompt once, without unlocking anything, so
// the user can confirm it works before turning it on.
func (a *App) TestBiometrics() error {
	return security.VerifyUser("Turn on biometric unlock for Terminyxx", 0)
}

// SetMasterPassword sets, changes (current required) or removes (next = "")
// the master password. Removing it turns the app lock off.
func (a *App) SetMasterPassword(current, next string) error {
	return a.sec.lock.SetPassword(current, next)
}

// VerifyMasterPassword checks the password without changing anything.
func (a *App) VerifyMasterPassword(password string) error {
	return a.sec.lock.Verify(password)
}

// Clipboard bindings

// ClipboardWrite copies text and, when auto-clear applies (scope "all", or
// sensitive text), schedules clearing it. It returns the delay in seconds,
// or 0 when the clipboard won't be cleared.
func (a *App) ClipboardWrite(text string, sensitive bool) (int, error) {
	if err := runtime.ClipboardSetText(a.ctx, text); err != nil {
		return 0, err
	}
	cfg := a.securityConfig().Clipboard
	if !cfg.AutoClear || !(cfg.Scope == "all" || sensitive || connection.LooksSensitive(text)) {
		a.sec.clip.Cancel()
		return 0, nil
	}
	a.sec.clip.Schedule(text, time.Duration(cfg.ClearAfterSeconds)*time.Second)
	return cfg.ClearAfterSeconds, nil
}

// Trusted host (known_hosts) bindings

func (a *App) ListTrustedHosts() ([]connection.TrustedHost, error) {
	if err := a.guard(); err != nil {
		return nil, err
	}
	return a.connMgr.TrustedHosts()
}

func (a *App) RemoveTrustedHost(id string) error {
	if err := a.guard(); err != nil {
		return err
	}
	return a.connMgr.RemoveTrustedHost(id)
}

// RDP certificates the user accepted (rdp_known_certs), for the Trusted
// hosts manager.

func (a *App) ListTrustedCerts() ([]rdpgw.TrustedCert, error) {
	if err := a.guard(); err != nil {
		return nil, err
	}
	return a.rdpgw.Trust().List()
}

// RemoveTrustedCert forgets the certificate of dest ("host:port"); the next
// connection asks to verify it again.
func (a *App) RemoveTrustedCert(dest string) error {
	if err := a.guard(); err != nil {
		return err
	}
	return a.rdpgw.Trust().Remove(dest)
}
