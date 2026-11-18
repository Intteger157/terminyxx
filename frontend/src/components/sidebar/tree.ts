import type { Folder, RDPProfile, SSHProfile, StreamProfile } from '../../types';

export type HostItem =
  | { kind: 'ssh'; id: string; name: string; detail: string; folderId: string; sortOrder: number; profile: SSHProfile }
  | { kind: 'rdp'; id: string; name: string; detail: string; folderId: string; sortOrder: number; profile: RDPProfile }
  | { kind: 'stream'; id: string; name: string; detail: string; folderId: string; sortOrder: number; profile: StreamProfile };

export interface FolderNode {
  folder: Folder;
  folders: FolderNode[];
  hosts: HostItem[];
  /** Hosts in this folder and all subfolders. */
  total: number;
}

export interface Tree {
  folders: FolderNode[];
  hosts: HostItem[];
  byId: Map<string, FolderNode>;
}

export type DragItem = { kind: 'folder' | 'ssh' | 'rdp' | 'stream'; id: string };

export const FOLDER_COLORS = ['', '#f87171', '#fb923c', '#facc15', '#4ade80', '#2dd4bf', '#60a5fa', '#a78bfa', '#f472b6'];

export function hostItems(ssh: SSHProfile[], rdp: RDPProfile[], streams: StreamProfile[] = []): HostItem[] {
  return [
    ...ssh.map<HostItem>((p) => ({
      kind: 'ssh',
      id: p.id,
      name: p.name,
      detail: `${p.username}@${p.host}${p.port !== 22 ? `:${p.port}` : ''}`,
      folderId: p.folderId ?? '',
      sortOrder: p.sortOrder ?? 0,
      profile: p,
    })),
    ...rdp.map<HostItem>((p) => ({
      kind: 'rdp',
      id: p.id,
      name: p.name,
      detail: `RDP · ${p.host}`,
      folderId: p.folderId ?? '',
      sortOrder: p.sortOrder ?? 0,
      profile: p,
    })),
    ...streams.map<HostItem>((p) => ({
      kind: 'stream',
      id: p.id,
      name: p.name,
      detail: streamDetail(p),
      folderId: p.folderId ?? '',
      sortOrder: p.sortOrder ?? 0,
      profile: p,
    })),
  ];
}

/** "telnet sw1:2323" or "COM3 · 115200 8N1". */
export function streamDetail(p: StreamProfile): string {
  if (p.kind === 'telnet') return `Telnet · ${p.host}${p.port !== 23 ? `:${p.port}` : ''}`;
  return `${p.device} · ${p.baud} ${p.dataBits}${(p.parity || 'n')[0].toUpperCase()}${p.stopBits}`;
}

const byOrder = <T extends { sortOrder: number; name: string }>(a: T, b: T) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

export function buildTree(folders: Folder[], hosts: HostItem[]): Tree {
  const byId = new Map<string, FolderNode>();
  for (const f of folders) byId.set(f.id, { folder: f, folders: [], hosts: [], total: 0 });

  const root: Tree = { folders: [], hosts: [], byId };
  for (const node of byId.values()) {
    const parent = node.folder.parentId ? byId.get(node.folder.parentId) : undefined;
    (parent ? parent.folders : root.folders).push(node);
  }
  for (const h of hosts) {
    const parent = h.folderId ? byId.get(h.folderId) : undefined;
    (parent ? parent.hosts : root.hosts).push(h);
  }

  const sortNode = (n: { folders: FolderNode[]; hosts: HostItem[] }): number => {
    n.folders.sort((a, b) => byOrder(a.folder, b.folder));
    n.hosts.sort(byOrder);
    let total = n.hosts.length;
    for (const f of n.folders) {
      f.total = sortNode(f);
      total += f.total;
    }
    return total;
  };
  sortNode(root);
  return root;
}

/** All hosts under a folder, depth first. */
export function hostsUnder(node: FolderNode): HostItem[] {
  return [...node.hosts, ...node.folders.flatMap(hostsUnder)];
}

/** Folder names from the root down to (and including) id. */
export function folderPath(tree: Tree, id: string): string[] {
  const names: string[] = [];
  let cur = tree.byId.get(id);
  for (let guard = 0; cur && guard < 64; guard++) {
    names.unshift(cur.folder.name);
    cur = cur.folder.parentId ? tree.byId.get(cur.folder.parentId) : undefined;
  }
  return names;
}

/** True if `target` is `id` or one of its descendants. */
export function isInside(tree: Tree, id: string, target: string): boolean {
  let cur: string | undefined = target;
  for (let guard = 0; cur && guard < 64; guard++) {
    if (cur === id) return true;
    cur = tree.byId.get(cur)?.folder.parentId;
  }
  return false;
}

/** Flattened folder list with depth, for <select> pickers. */
export function folderOptions(tree: Tree): { id: string; label: string; depth: number }[] {
  const out: { id: string; label: string; depth: number }[] = [];
  const walk = (nodes: FolderNode[], depth: number) => {
    for (const n of nodes) {
      out.push({ id: n.folder.id, label: n.folder.name, depth });
      walk(n.folders, depth + 1);
    }
  };
  walk(tree.folders, 0);
  return out;
}
