package main

import (
	"errors"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"terminyxx/internal/connection"
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
	return a.sec.lock.Unlock(password)
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
	return a.connMgr.TrustedHosts()
}

func (a *App) RemoveTrustedHost(id string) error {
	return a.connMgr.RemoveTrustedHost(id)
}
