import { useSyncExternalStore } from 'react';
import { GetScreenSharing, SetCaptureProtection } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import { getSettings, subscribeSettings } from './settings';

/**
 * Keeps the native "hide from screen capture" window flag in sync with
 * `settings.security.hideFromCapture`, remembers whether the OS refused it, and
 * tracks whether the screen is being shared right now (Go emits "capture:sharing").
 */
export interface CaptureProtectionState {
  /** The setting is on. */
  enabled: boolean;
  /** The OS refused to apply it (unsupported system); null when it worked. */
  error: string | null;
  /** Screen sharing can be detected on this OS (Windows only). */
  detectable: boolean;
  /** Another app is capturing the screen right now. */
  sharing: boolean;
  /** Apps that are capturing, for display. */
  sharingApps: string[];
}

let state: CaptureProtectionState = { enabled: false, error: null, detectable: false, sharing: false, sharingApps: [] };
let applied: boolean | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<CaptureProtectionState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

async function apply() {
  const on = getSettings().security.hideFromCapture;
  if (on === applied) return;
  applied = on;
  set({ enabled: on, error: null });
  try {
    await SetCaptureProtection(on);
  } catch (e) {
    if (applied === on) set({ error: on ? String(e) : null });
  }
}

type Sharing = { supported: boolean; active: boolean; apps: string[] | null };

const onSharing = (s: Sharing) => set({ detectable: !!s.supported, sharing: !!s.active, sharingApps: s.apps ?? [] });

let started = false;

export function initCaptureProtection(): void {
  if (started) return;
  started = true;
  void apply();
  subscribeSettings(() => void apply());
  EventsOn('capture:sharing', onSharing);
  GetScreenSharing().then(onSharing).catch(() => {});
}

/**
 * Whether to show the "hidden from screen sharing" notice: while a share is
 * detected, always where detection isn't possible (macOS), and when hiding failed.
 */
export function showCaptureNotice(s: CaptureProtectionState): boolean {
  return s.enabled && (!!s.error || !s.detectable || s.sharing);
}

export function useCaptureProtection(): CaptureProtectionState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state
  );
}
