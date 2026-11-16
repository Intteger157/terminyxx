import { useSyncExternalStore } from 'react';
import type { SSHProfile } from '../types';

// What is being dragged towards the terminal area: an open session (a tab or
// a pane header) or a saved host from the sidebar. dragover events can't read
// dataTransfer, so the drag source records it here.
export type PaneDrag = { kind: 'session'; id: string } | { kind: 'host'; profile: SSHProfile };

let current: PaneDrag | null = null;
const listeners = new Set<() => void>();

export function setPaneDrag(d: PaneDrag | null) {
  current = d;
  listeners.forEach((l) => l());
}

export function getPaneDrag() {
  return current;
}

export function usePaneDrag(): PaneDrag | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current
  );
}
