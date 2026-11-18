// Package security holds the app-level security features that aren't tied
// to one SSH connection: the settings model, the app lock (master password
// and OS biometrics) and the clipboard auto-clear timer.
package security

import "encoding/json"

// SecurityConfig is the "security" part of the settings JSON the frontend
// saves (see frontend/src/lib/settings.ts, which mirrors it). The backend
// decodes it on startup and on every SaveSettings, so both sides read one
// source of truth. The master password is not part of it: its hash is kept
// under its own settings key (see Lock).
type SecurityConfig struct {
	// HideFromCapture excludes the window from screen capture/sharing.
	HideFromCapture bool            `json:"hideFromCapture"`
	Lock            LockConfig      `json:"lock"`
	Clipboard       ClipboardConfig `json:"clipboard"`
	Paste           PasteConfig     `json:"paste"`
	Masking         MaskingConfig   `json:"masking"`
	SSH             SSHConfig       `json:"ssh"`
	// OSC52 is what remote programs may do with the clipboard through the
	// OSC 52 escape sequence: "disabled", "prompt" or "write" (write-only,
	// no prompt). Reading the clipboard is never allowed.
	OSC52 string `json:"osc52"`
}

// LockConfig controls when the app locks. Locking is available only once a
// master password is set.
type LockConfig struct {
	// Biometrics allows unlocking with Touch ID / Windows Hello.
	Biometrics bool `json:"biometrics"`
	// AutoLockMinutes locks after this much inactivity; 0 = never.
	AutoLockMinutes int `json:"autoLockMinutes"`
	// LockOnMinimize locks when the window is minimized or the computer
	// wakes from sleep.
	LockOnMinimize bool `json:"lockOnMinimize"`
}

type ClipboardConfig struct {
	// AutoClear clears the clipboard after copying from Terminyxx, if it
	// still holds what was copied.
	AutoClear         bool `json:"autoClear"`
	ClearAfterSeconds int  `json:"clearAfterSeconds"`
	// Scope is "sensitive" (only text that looks like a secret, plus
	// explicitly sensitive copies) or "all".
	Scope string `json:"scope"`
}

// PasteConfig is enforced by the frontend (it owns the paste path); it is
// here so the struct documents the whole settings model.
type PasteConfig struct {
	WarnMultiline bool `json:"warnMultiline"`
	WarnDangerous bool `json:"warnDangerous"`
}

type MaskingConfig struct {
	// Enabled is "presentation mode": secrets in terminal output are
	// replaced with bullets before they reach the terminal view.
	Enabled bool `json:"enabled"`
	MaskIPs bool `json:"maskIPs"`
}

type SSHConfig struct {
	// ModernAlgorithmsOnly disables SHA-1, CBC and other legacy algorithms
	// unless a host profile allows them.
	ModernAlgorithmsOnly bool `json:"modernAlgorithmsOnly"`
	// AllowAgentForwarding is the global switch for agent forwarding; hosts
	// opt in individually.
	AllowAgentForwarding bool `json:"allowAgentForwarding"`
	// Agent is where agent keys come from: auto, openssh, pageant or custom
	// (AgentPath, a unix socket or a Windows named pipe).
	Agent     string `json:"agent"`
	AgentPath string `json:"agentPath"`
	// AllowX11Forwarding is the global switch for X11 forwarding; hosts opt
	// in individually. X11Display is the local X server ("" = $DISPLAY or
	// localhost:0.0).
	AllowX11Forwarding bool   `json:"allowX11Forwarding"`
	X11Display         string `json:"x11Display"`
}

// Defaults match DEFAULT_SETTINGS.security in the frontend.
func Defaults() SecurityConfig {
	return SecurityConfig{
		HideFromCapture: true,
		Lock:            LockConfig{AutoLockMinutes: 15, LockOnMinimize: false},
		Clipboard:       ClipboardConfig{AutoClear: true, ClearAfterSeconds: 30, Scope: "sensitive"},
		Paste:           PasteConfig{WarnMultiline: true, WarnDangerous: true},
		Masking:         MaskingConfig{},
		SSH:             SSHConfig{ModernAlgorithmsOnly: true, Agent: "auto"},
		OSC52:           "prompt",
	}
}

// FromSettingsJSON extracts the security settings from the app settings
// JSON, filling anything missing or invalid with defaults.
func FromSettingsJSON(raw string) SecurityConfig {
	cfg := Defaults()
	if raw == "" {
		return cfg
	}
	var wrapper struct {
		Security json.RawMessage `json:"security"`
	}
	if json.Unmarshal([]byte(raw), &wrapper) != nil || len(wrapper.Security) == 0 {
		return cfg
	}
	// Decoding over the defaults keeps them for absent fields.
	_ = json.Unmarshal(wrapper.Security, &cfg)
	return cfg.normalized()
}

func (c SecurityConfig) normalized() SecurityConfig {
	d := Defaults()
	switch c.Lock.AutoLockMinutes {
	case 0, 1, 5, 15, 30:
	default:
		c.Lock.AutoLockMinutes = d.Lock.AutoLockMinutes
	}
	switch c.Clipboard.ClearAfterSeconds {
	case 15, 30, 60:
	default:
		c.Clipboard.ClearAfterSeconds = d.Clipboard.ClearAfterSeconds
	}
	if c.Clipboard.Scope != "all" {
		c.Clipboard.Scope = "sensitive"
	}
	switch c.OSC52 {
	case "disabled", "prompt", "write":
	default:
		c.OSC52 = d.OSC52
	}
	return c
}
