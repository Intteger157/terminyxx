import { useSyncExternalStore } from 'react';
import { GetSettings, SaveSettings } from '../../wailsjs/go/main/App';
import { THEMES } from './themes';

export type CursorStyle = 'bar' | 'block' | 'underline';

/** ANSI color names, so highlight colors follow the terminal theme. */
export const HIGHLIGHT_COLORS = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan'] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export interface HighlightRule {
  id: string;
  name: string;
  /** Comma-separated words (whole-word match), or a regular expression when `regex` is set. */
  pattern: string;
  regex: boolean;
  caseSensitive: boolean;
  color: HighlightColor;
  bold: boolean;
  underline: boolean;
  enabled: boolean;
}

export interface AppSettings {
  appearance: {
    themeId: string;
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    cursorStyle: CursorStyle;
    cursorBlink: boolean;
  };
  terminal: {
    scrollback: number;
    copyOnSelect: boolean;
    rightClick: 'menu' | 'paste';
    bell: boolean;
  };
  highlight: {
    enabled: boolean;
    rules: HighlightRule[];
  };
  updates: {
    /** Look for a newer GitHub release at startup. */
    autoCheck: boolean;
  };
  rdp: {
    /** Open RDP hosts in a tab (IronRDP) instead of the system's RDP client. */
    builtin: boolean;
  };
  sessions: {
    /** Reconnect SSH sessions that dropped (network, sleep), with growing delays. */
    autoReconnect: boolean;
    /** Reopen the tabs and split layout of the last run at startup. */
    restore: boolean;
  };
  hosts: {
    /** Show a green/red dot for hosts whose port answers (a TCP connect, nothing sent). */
    availability: boolean;
    /** Seconds between checks. */
    availabilitySeconds: AvailabilitySeconds;
    /** How many hosts the Recent list shows (0 hides it). */
    recentCount: number;
  };
  recordings: {
    /** Delete finished recordings older than this many days; 0 = keep. */
    keepDays: RecordingKeepDays;
    /** Delete the oldest recordings while the folder is larger; 0 = no limit. */
    maxSizeMB: RecordingMaxMB;
  };
  /**
   * Mirrors `security.SecurityConfig` in internal/security/config.go: the Go
   * side decodes this part of the JSON on every save and enforces it.
   */
  security: {
    /** Exclude the window from screen capture and screen sharing (calls, recordings). */
    hideFromCapture: boolean;
    lock: {
      /** Unlock with Touch ID / Windows Hello (needs a master password). */
      biometrics: boolean;
      /** Lock after this many minutes without input; 0 = never. */
      autoLockMinutes: AutoLockMinutes;
      /** Lock when the window is minimized or the computer wakes from sleep. */
      lockOnMinimize: boolean;
    };
    clipboard: {
      autoClear: boolean;
      clearAfterSeconds: ClearAfterSeconds;
      /** "sensitive": only text that looks like a secret; "all": every copy. */
      scope: 'sensitive' | 'all';
    };
    paste: {
      warnMultiline: boolean;
      warnDangerous: boolean;
    };
    /** Presentation mode: secrets in terminal output are replaced with bullets. */
    masking: {
      enabled: boolean;
      maskIPs: boolean;
    };
    ssh: {
      modernAlgorithmsOnly: boolean;
      allowAgentForwarding: boolean;
      /** Where agent keys come from (connection.AgentAuto…). */
      agent: AgentSource;
      /** Socket or named pipe for agent 'custom'. */
      agentPath: string;
      /** Global switch for X11 forwarding; hosts opt in. */
      allowX11Forwarding: boolean;
      /** Local X server, e.g. localhost:0.0 ('' = $DISPLAY or localhost:0.0). */
      x11Display: string;
    };
    /** What remote programs may do with the clipboard through OSC 52. */
    osc52: Osc52Policy;
  };
}

export const AVAILABILITY_OPTIONS = [30, 60, 300] as const;
export type AvailabilitySeconds = (typeof AVAILABILITY_OPTIONS)[number];

export const RECORDING_KEEP_OPTIONS = [0, 7, 30, 90, 365] as const;
export type RecordingKeepDays = (typeof RECORDING_KEEP_OPTIONS)[number];
export const RECORDING_SIZE_OPTIONS = [0, 500, 1024, 5120, 20480] as const;
export type RecordingMaxMB = (typeof RECORDING_SIZE_OPTIONS)[number];

export type AgentSource = 'auto' | 'openssh' | 'pageant' | 'custom';
const AGENT_SOURCES: AgentSource[] = ['auto', 'openssh', 'pageant', 'custom'];

export const AUTO_LOCK_OPTIONS = [0, 1, 5, 15, 30] as const;
export type AutoLockMinutes = (typeof AUTO_LOCK_OPTIONS)[number];
export const CLEAR_AFTER_OPTIONS = [15, 30, 60] as const;
export type ClearAfterSeconds = (typeof CLEAR_AFTER_OPTIONS)[number];
export type Osc52Policy = 'disabled' | 'prompt' | 'write';

export const FONT_OPTIONS = [
  { value: 'JetBrains Mono', label: 'JetBrains Mono (bundled)' },
  { value: 'Cascadia Mono', label: 'Cascadia Mono' },
  { value: 'Consolas', label: 'Consolas' },
  { value: 'Fira Code', label: 'Fira Code' },
  { value: 'Menlo', label: 'Menlo' },
  { value: 'SF Mono', label: 'SF Mono' },
  { value: 'Courier New', label: 'Courier New' },
];

/** The chosen font first, with the bundled one and system monospace as fallbacks. */
export function fontStack(family: string): string {
  const bundled = '"JetBrains Mono Variable", "JetBrains Mono"';
  const head = family === 'JetBrains Mono' ? bundled : `"${family}", ${bundled}`;
  return `${head}, "Cascadia Mono", Consolas, Menlo, monospace`;
}

const IPV4 = String.raw`\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?::\d{1,5})?(?:/\d{1,2})?\b`;

export const DEFAULT_RULES: HighlightRule[] = [
  {
    id: 'errors',
    name: 'Errors',
    pattern: 'error, errors, err, failed, failure, fail, fatal, denied, refused, critical, crit, panic, exception, unreachable, not found, no such file or directory, permission denied',
    regex: false,
    caseSensitive: false,
    color: 'red',
    bold: true,
    underline: false,
    enabled: true,
  },
  {
    id: 'warnings',
    name: 'Warnings',
    pattern: 'warn, warning, warnings, deprecated, timeout, timed out, retrying, inactive, dead',
    regex: false,
    caseSensitive: false,
    color: 'yellow',
    bold: false,
    underline: false,
    enabled: true,
  },
  {
    id: 'success',
    name: 'Success',
    pattern: 'ok, success, successful, successfully, done, passed, running, enabled, connected, listening, healthy, up-to-date',
    regex: false,
    caseSensitive: false,
    color: 'green',
    bold: false,
    underline: false,
    enabled: true,
  },
  {
    id: 'ipv4',
    name: 'IP addresses',
    pattern: IPV4,
    regex: true,
    caseSensitive: false,
    color: 'cyan',
    bold: false,
    underline: false,
    enabled: true,
  },
  {
    id: 'mac',
    name: 'MAC addresses',
    pattern: String.raw`\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b`,
    regex: true,
    caseSensitive: false,
    color: 'magenta',
    bold: false,
    underline: false,
    enabled: false,
  },
];

export const DEFAULT_SETTINGS: AppSettings = {
  appearance: {
    themeId: 'terminyxx',
    fontFamily: 'JetBrains Mono',
    fontSize: 13,
    lineHeight: 1.2,
    cursorStyle: 'bar',
    cursorBlink: true,
  },
  terminal: {
    scrollback: 10000,
    copyOnSelect: false,
    rightClick: 'menu',
    bell: false,
  },
  highlight: {
    enabled: true,
    rules: DEFAULT_RULES,
  },
  updates: { autoCheck: true },
  rdp: { builtin: true },
  sessions: { autoReconnect: true, restore: false },
  hosts: { availability: false, availabilitySeconds: 60, recentCount: 5 },
  recordings: { keepDays: 0, maxSizeMB: 0 },
  security: {
    hideFromCapture: true,
    lock: { biometrics: false, autoLockMinutes: 15, lockOnMinimize: false },
    clipboard: { autoClear: true, clearAfterSeconds: 30, scope: 'sensitive' },
    paste: { warnMultiline: true, warnDangerous: true },
    masking: { enabled: false, maskIPs: false },
    ssh: { modernAlgorithmsOnly: true, allowAgentForwarding: false, agent: 'auto', agentPath: '', allowX11Forwarding: false, x11Display: '' },
    osc52: 'prompt',
  },
};

// ── store ──────────────────────────────────────────────────────────────

let current: AppSettings = DEFAULT_SETTINGS;
const listeners = new Set<() => void>();
let saveTimer: number | undefined;

const clamp = (v: unknown, min: number, max: number, def: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;

/** Fills in missing or invalid fields so older or hand-edited JSON still works. */
function normalize(raw: unknown): AppSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<AppSettings>;
  const a = { ...DEFAULT_SETTINGS.appearance, ...(r.appearance ?? {}) };
  const t = { ...DEFAULT_SETTINGS.terminal, ...(r.terminal ?? {}) };
  const h = { ...DEFAULT_SETTINGS.highlight, ...(r.highlight ?? {}) };
  const sec = { ...DEFAULT_SETTINGS.security, ...(r.security ?? {}) };
  const ds = DEFAULT_SETTINGS.security;
  const lock = { ...ds.lock, ...(sec.lock ?? {}) };
  const clip = { ...ds.clipboard, ...(sec.clipboard ?? {}) };
  const paste = { ...ds.paste, ...(sec.paste ?? {}) };
  const mask = { ...ds.masking, ...(sec.masking ?? {}) };
  const ssh = { ...ds.ssh, ...(sec.ssh ?? {}) };
  return {
    appearance: {
      themeId: THEMES.some((x) => x.id === a.themeId) ? a.themeId : DEFAULT_SETTINGS.appearance.themeId,
      fontFamily: typeof a.fontFamily === 'string' && a.fontFamily ? a.fontFamily : DEFAULT_SETTINGS.appearance.fontFamily,
      fontSize: clamp(a.fontSize, 8, 32, 13),
      lineHeight: clamp(a.lineHeight, 1, 2, 1.2),
      cursorStyle: ['bar', 'block', 'underline'].includes(a.cursorStyle) ? a.cursorStyle : 'bar',
      cursorBlink: !!a.cursorBlink,
    },
    terminal: {
      scrollback: clamp(t.scrollback, 500, 200000, 10000),
      copyOnSelect: !!t.copyOnSelect,
      rightClick: t.rightClick === 'paste' ? 'paste' : 'menu',
      bell: !!t.bell,
    },
    highlight: {
      enabled: !!h.enabled,
      rules: Array.isArray(h.rules)
        ? h.rules
            .filter((x) => x && typeof x.pattern === 'string')
            .map((x) => ({
              ...x,
              id: x.id || crypto.randomUUID(),
              name: x.name || 'Rule',
              color: HIGHLIGHT_COLORS.includes(x.color) ? x.color : 'yellow',
            }))
        : DEFAULT_RULES,
    },
    updates: { autoCheck: (r.updates?.autoCheck ?? true) !== false },
    rdp: { builtin: (r.rdp?.builtin ?? true) !== false },
    sessions: {
      autoReconnect: (r.sessions?.autoReconnect ?? true) !== false,
      restore: !!r.sessions?.restore,
    },
    hosts: {
      availability: !!r.hosts?.availability,
      availabilitySeconds: AVAILABILITY_OPTIONS.find((v) => v === r.hosts?.availabilitySeconds) ?? 60,
      recentCount: Math.round(clamp(r.hosts?.recentCount, 0, 20, 5)),
    },
    recordings: {
      keepDays: RECORDING_KEEP_OPTIONS.find((v) => v === r.recordings?.keepDays) ?? 0,
      maxSizeMB: RECORDING_SIZE_OPTIONS.find((v) => v === r.recordings?.maxSizeMB) ?? 0,
    },
    security: {
      hideFromCapture: sec.hideFromCapture !== false,
      lock: {
        biometrics: !!lock.biometrics,
        autoLockMinutes: AUTO_LOCK_OPTIONS.includes(lock.autoLockMinutes) ? lock.autoLockMinutes : ds.lock.autoLockMinutes,
        lockOnMinimize: !!lock.lockOnMinimize,
      },
      clipboard: {
        autoClear: !!clip.autoClear,
        clearAfterSeconds: CLEAR_AFTER_OPTIONS.includes(clip.clearAfterSeconds) ? clip.clearAfterSeconds : ds.clipboard.clearAfterSeconds,
        scope: clip.scope === 'all' ? 'all' : 'sensitive',
      },
      paste: { warnMultiline: !!paste.warnMultiline, warnDangerous: !!paste.warnDangerous },
      masking: { enabled: !!mask.enabled, maskIPs: !!mask.maskIPs },
      ssh: {
        modernAlgorithmsOnly: !!ssh.modernAlgorithmsOnly,
        allowAgentForwarding: !!ssh.allowAgentForwarding,
        agent: AGENT_SOURCES.includes(ssh.agent) ? ssh.agent : 'auto',
        agentPath: typeof ssh.agentPath === 'string' ? ssh.agentPath.slice(0, 1024) : '',
        allowX11Forwarding: !!ssh.allowX11Forwarding,
        x11Display: typeof ssh.x11Display === 'string' ? ssh.x11Display.trim().slice(0, 256) : '',
      },
      osc52: (['disabled', 'prompt', 'write'] as const).includes(sec.osc52) ? sec.osc52 : ds.osc52,
    },
  };
}

export async function loadSettings(): Promise<void> {
  try {
    const raw = await GetSettings();
    if (raw) current = normalize(JSON.parse(raw));
  } catch {
    // first run, no store, or bad JSON: keep defaults
  }
  listeners.forEach((l) => l());
}

export function getSettings(): AppSettings {
  return current;
}

export function updateSettings(fn: (s: AppSettings) => AppSettings): void {
  const prev = current;
  current = normalize(fn(current));
  listeners.forEach((l) => l());
  window.clearTimeout(saveTimer);
  const save = () => SaveSettings(JSON.stringify(current)).catch(() => {});
  // The backend applies security settings (output masking, algorithms…)
  // when they are saved, so those are saved right away.
  if (JSON.stringify(prev.security) !== JSON.stringify(current.security)) void save();
  else saveTimer = window.setTimeout(save, 300);
}

export function updateSecurity<K extends keyof AppSettings['security']>(key: K, patch: Partial<AppSettings['security'][K]> | AppSettings['security'][K]): void {
  updateSettings((s) => {
    const cur = s.security[key];
    const next = typeof cur === 'object' && cur !== null && typeof patch === 'object' ? { ...cur, ...patch } : patch;
    return { ...s, security: { ...s.security, [key]: next } };
  });
}

export function subscribeSettings(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useSettings(): AppSettings {
  return useSyncExternalStore(subscribeSettings, getSettings);
}
