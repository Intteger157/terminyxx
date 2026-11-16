import { useSyncExternalStore } from 'react';
import { GetBiometrics, GetLockStatus, LockApp } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import { getSettings } from './settings';

/**
 * Mirrors the backend's lock state (internal/security/lock.go). The backend
 * is the authority: it starts locked when a master password is set, holds
 * terminal output back while locked and emits "app:lock" on every change.
 * This module also runs the inactivity timer, since only the webview sees
 * keyboard and mouse input.
 */
export interface LockState {
  /** A master password is set, so the app can lock. */
  configured: boolean;
  locked: boolean;
  retryAfterMs: number;
  /** Biometric unlock offered by the OS. */
  biometrics: { available: boolean; kind: string; reason: string };
  /** The first status has arrived from the backend. */
  ready: boolean;
}

let state: LockState = {
  configured: false,
  locked: false,
  retryAfterMs: 0,
  biometrics: { available: false, kind: '', reason: '' },
  ready: false,
};
const listeners = new Set<() => void>();

function set(patch: Partial<LockState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

type Status = { configured: boolean; locked: boolean; retryAfterMs: number };
const onStatus = (s: Status) => set({ configured: !!s.configured, locked: !!s.locked, retryAfterMs: s.retryAfterMs ?? 0, ready: true });

export async function refreshLockStatus(): Promise<void> {
  try {
    onStatus(await GetLockStatus());
  } catch {
    set({ ready: true });
  }
}

let lastActivity = Date.now();
let started = false;

// async: without the Wails runtime (plain browser) the bindings throw
// synchronously, which must not stop main.tsx from rendering.
export async function initAppLock(): Promise<void> {
  if (started) return refreshLockStatus();
  started = true;
  try {
    EventsOn('app:lock', onStatus);
    GetBiometrics()
      .then((b) => set({ biometrics: { available: !!b.available, kind: b.kind, reason: b.reason } }))
      .catch(() => {});
  } catch {
    // no runtime: keep defaults
  }

  const touch = () => {
    lastActivity = Date.now();
  };
  for (const ev of ['keydown', 'mousedown', 'mousemove', 'wheel', 'touchstart']) {
    window.addEventListener(ev, touch, { capture: true, passive: true });
  }
  window.setInterval(() => {
    const minutes = getSettings().security.lock.autoLockMinutes;
    // While locked the clock restarts, so unlocking gives a full period.
    if (state.locked) lastActivity = Date.now();
    if (!minutes || !state.configured || state.locked) return;
    if (Date.now() - lastActivity >= minutes * 60_000) void lockNow();
  }, 5_000);
  return refreshLockStatus();
}

/** Locks now; resolves false when no master password is set. */
export async function lockNow(): Promise<boolean> {
  try {
    return await LockApp();
  } catch {
    return false;
  }
}

/** Restart the inactivity timer (after unlocking). */
export function markActive(): void {
  lastActivity = Date.now();
}

export function useAppLock(): LockState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state
  );
}
