import { useSyncExternalStore } from 'react';

// "Type in all panes": while on, keyboard input in any pane of the visible
// tab is sent to every pane of that tab.

let enabled = false;
let panes: string[] = [];
const listeners = new Set<() => void>();
let snapshot = { enabled, count: 0 };

function emit() {
  snapshot = { enabled, count: panes.length };
  listeners.forEach((l) => l());
}

export function setBroadcastPanes(ids: string[]) {
  if (ids.length === panes.length && ids.every((id, i) => id === panes[i])) return;
  // Switching tabs or changing the layout turns it off: typing into a
  // different set of panes than the user saw is dangerous.
  panes = ids;
  enabled = false;
  emit();
}

export function setBroadcast(on: boolean) {
  enabled = on && panes.length > 1;
  emit();
}

export function toggleBroadcast() {
  setBroadcast(!enabled);
}

/** Connection ids that should receive input typed in `id`. */
export function inputTargets(id: string): string[] {
  return enabled && panes.includes(id) ? panes : [id];
}

export function useBroadcast() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot
  );
}
