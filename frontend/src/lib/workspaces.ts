import { useSyncExternalStore } from 'react';
import { GetUIState, SaveUIState } from '../../wailsjs/go/main/App';
import { paneIds, removePane } from './layout';
import type { LayoutNode, TabGroup } from './layout';
import type { TerminalTab } from '../types';

// A workspace is a saved set of title-bar tabs with their split layouts,
// where every pane is a saved SSH, RDP, Telnet or serial host. The same shape is used for the
// session restored at startup.

export interface WorkspacePane {
  kind: 'ssh' | 'rdp' | 'stream';
  profileId: string;
}

export interface Workspace {
  id: string;
  name: string;
  /** Layout trees; their pane ids are keys of `panes`. */
  groups: { root: LayoutNode; focus: string }[];
  panes: Record<string, WorkspacePane>;
  /** Index of the tab that was visible. */
  active: number;
}

/** Which saved host a session belongs to, if any. */
function paneOf(tab: TerminalTab | undefined, saved: Set<string>): WorkspacePane | null {
  if (!tab) return null;
  if (tab.rdp && saved.has(tab.rdp.id)) return { kind: 'rdp', profileId: tab.rdp.id };
  if (tab.stream?.id && saved.has(tab.stream.id)) return { kind: 'stream', profileId: tab.stream.id };
  if (tab.profile && saved.has(tab.profile.id)) return { kind: 'ssh', profileId: tab.profile.id };
  return null;
}

/**
 * Captures the open tabs (or only `groupIds`). Panes that are not saved hosts
 * (quick connections) are left out. Null if nothing is left.
 */
export function snapshot(
  name: string,
  groups: TabGroup[],
  tabs: TerminalTab[],
  activeTabId: string | null,
  saved: Set<string>,
  groupIds?: string[]
): Workspace | null {
  const panes: Record<string, WorkspacePane> = {};
  const out: Workspace['groups'] = [];
  let active = 0;
  for (const g of groups) {
    if (groupIds && !groupIds.includes(g.id)) continue;
    let root: LayoutNode | null = g.root;
    for (const id of paneIds(g.root)) {
      const p = paneOf(tabs.find((t) => t.id === id), saved);
      if (p) panes[id] = p;
      else if (root) root = removePane(root, id);
    }
    if (!root) continue;
    if (activeTabId && paneIds(root).includes(activeTabId)) active = out.length;
    const focus = paneIds(root).includes(g.focus) ? g.focus : paneIds(root)[0];
    out.push({ root, focus });
  }
  if (out.length === 0) return null;
  return { id: crypto.randomUUID(), name, groups: out, panes, active };
}

/** Gives every pane and split a fresh id, so a workspace can be opened twice. */
export function instantiate(ws: Workspace): { groups: TabGroup[]; panes: { id: string; pane: WorkspacePane }[]; active: string | null } {
  const ids = new Map<string, string>();
  const panes: { id: string; pane: WorkspacePane }[] = [];
  const walk = (n: LayoutNode): LayoutNode | null => {
    if (n.kind === 'pane') {
      const pane = ws.panes[n.id];
      if (!pane) return null;
      const id = crypto.randomUUID();
      ids.set(n.id, id);
      panes.push({ id, pane });
      return { kind: 'pane', id };
    }
    const children: LayoutNode[] = [];
    const sizes: number[] = [];
    n.children.forEach((c, i) => {
      const m = walk(c);
      if (m) {
        children.push(m);
        sizes.push(n.sizes[i] ?? 1 / n.children.length);
      }
    });
    if (children.length === 0) return null;
    if (children.length === 1) return children[0];
    const sum = sizes.reduce((a, b) => a + b, 0) || 1;
    return { kind: 'split', id: crypto.randomUUID(), dir: n.dir, children, sizes: sizes.map((x) => x / sum) };
  };
  const groups: TabGroup[] = [];
  let active: string | null = null;
  ws.groups.forEach((g, i) => {
    const root = walk(g.root);
    if (!root) return;
    const focus = ids.get(g.focus) ?? paneIds(root)[0];
    groups.push({ id: crypto.randomUUID(), root, focus });
    if (i === ws.active || active === null) active = focus;
  });
  return { groups, panes, active };
}

/** Drops panes whose host no longer exists. */
export function prune(ws: Workspace, exists: (p: WorkspacePane) => boolean): Workspace {
  const panes = Object.fromEntries(Object.entries(ws.panes).filter(([, p]) => exists(p)));
  return { ...ws, panes };
}

function isWorkspace(x: unknown): x is Workspace {
  const w = x as Workspace;
  return !!w && typeof w.name === 'string' && Array.isArray(w.groups) && typeof w.panes === 'object' && w.panes !== null;
}

// --- named workspaces (shared list) ---

let list: Workspace[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function loadWorkspaces(): Promise<Workspace[]> {
  try {
    const raw = await GetUIState('workspaces');
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    list = Array.isArray(parsed) ? parsed.filter(isWorkspace) : [];
    emit();
  } catch {
    // locked or damaged: keep what we have
  }
  return list;
}

async function persist(next: Workspace[]) {
  list = next;
  emit();
  await SaveUIState('workspaces', JSON.stringify(next));
}

export function useWorkspaces(): Workspace[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => list
  );
}

/** Saves a workspace; one with the same name (any case) is replaced. */
export function saveWorkspace(ws: Workspace): Promise<void> {
  const same = list.find((w) => w.name.toLowerCase() === ws.name.toLowerCase());
  const item = same ? { ...ws, id: same.id } : ws;
  return persist(same ? list.map((w) => (w.id === same.id ? item : w)) : [...list, item]);
}

export function deleteWorkspace(id: string): Promise<void> {
  return persist(list.filter((w) => w.id !== id));
}

// --- the session restored at startup ---

export async function loadLastSession(): Promise<Workspace | null> {
  try {
    const raw = await GetUIState('session');
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isWorkspace(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

let lastSaved = '';
let timer = 0;

/** Remembers the current layout (debounced); null clears it. */
export function rememberSession(ws: Workspace | null) {
  const value = ws ? JSON.stringify({ ...ws, id: 'session', name: 'Last session' }) : '';
  if (value === lastSaved) return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    lastSaved = value;
    SaveUIState('session', value).catch(() => {});
  }, 800);
}
