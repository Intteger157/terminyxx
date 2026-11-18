import { useEffect, useSyncExternalStore } from 'react';
import { DeleteIdentity, ListIdentities, SaveIdentity } from '../../wailsjs/go/main/App';
import { store } from '../../wailsjs/go/models';
import type { Identity } from '../types';

// Saved identities (user + password or key) shared by SSH hosts. One list for
// the whole UI; it is loaded when something first needs it and after changes.

let list: Identity[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export async function reloadIdentities(): Promise<Identity[]> {
  try {
    list = (await ListIdentities()) ?? [];
    loaded = true;
    emit();
  } catch {
    // locked or storage unavailable: keep what we have
  }
  return list;
}

export function getIdentities(): Identity[] {
  return list;
}

export function identityById(id: string | undefined): Identity | undefined {
  return id ? list.find((i) => i.id === id) : undefined;
}

export function useIdentities(): Identity[] {
  const value = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => list
  );
  useEffect(() => {
    if (!loaded) void reloadIdentities();
  }, []);
  return value;
}

export async function saveIdentity(i: Identity): Promise<void> {
  await SaveIdentity(
    store.Identity.createFrom({
      ...i,
      hasPassword: !!i.hasPassword,
      clearPassword: !!i.clearPassword,
      sortOrder: i.sortOrder ?? 0,
      hosts: 0,
    })
  );
  await reloadIdentities();
}

export async function deleteIdentity(id: string): Promise<void> {
  await DeleteIdentity(id);
  await reloadIdentities();
}

/** Short description of an identity's login, e.g. "deploy · key". */
export function identitySummary(i: Identity): string {
  const auth = i.authType === 'key' ? (i.keyPath ? `key ${i.keyPath}` : 'default keys') : i.hasPassword ? 'saved password' : 'password asked at connect';
  return `${i.username || '(no user)'} · ${auth}`;
}
