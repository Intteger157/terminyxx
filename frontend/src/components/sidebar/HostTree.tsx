import { useEffect, useRef, useState } from 'react';
import { hostTagColor } from '../../lib/hostOptions';
import type { DragEvent, ReactNode } from 'react';
import { ProtoBadge, hostIcon } from './ProtoBadge';
import { ChevronRight, Folder as FolderIcon, FolderOpen, MoreHorizontal, Star } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import type { DragItem, FolderNode, HostItem, Tree } from './tree';
import { isInside } from './tree';
import { setPaneDrag } from '../../lib/paneDrag';

export interface TreeActions {
  openHost: (h: HostItem) => void;
  hostMenu: (e: React.MouseEvent, h: HostItem) => void;
  /** Context menu for several selected hosts. */
  selectionMenu: (e: React.MouseEvent, hosts: HostItem[]) => void;
  toggleFavorite: (h: HostItem) => void;
  folderMenu: (e: React.MouseEvent, f: FolderNode) => void;
  move: (item: DragItem, parentId: string, index: number) => void;
  renameFolder: (id: string, name: string) => void;
}

interface HostTreeProps {
  tree: Tree;
  /** Folder whose contents are shown at the top level ("" = root). */
  rootId?: string;
  connected: Set<string>;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  renamingId: string | null;
  onRenameDone: () => void;
  actions: TreeActions;
  footer?: ReactNode;
  /** Pinned lists shown above the tree (Favorites, Recent). */
  sections?: TreeSection[];
  /** Selected hosts (Ctrl/Cmd/Shift+click). */
  selection?: HostItem[];
  /** Ctrl/Cmd/Shift+click on a host; plain clicks open it and clear the selection. */
  onSelectClick?: (h: HostItem, e: React.MouseEvent) => void;
  onClearSelection?: () => void;
  /** Availability by host key ("ssh:<id>"): true up, false down, absent unknown. */
  reach?: Map<string, boolean>;
}

export interface TreeSection {
  id: string;
  title: string;
  icon: ReactNode;
  hosts: HostItem[];
}

/** Second line of a host row: address and tags. */
export function hostSubtitle(h: HostItem): string {
  return h.meta.tags.length ? `${h.detail} · ${h.meta.tags.map((t) => `#${t}`).join(' ')}` : h.detail;
}

/** Tooltip of a host row: address, tags and notes. */
export function hostTooltip(h: HostItem): string {
  const lines = [h.detail];
  if (h.meta.tags.length) lines.push(h.meta.tags.map((t) => `#${t}`).join(' '));
  if (h.meta.notes.trim()) lines.push('', h.meta.notes.trim().slice(0, 600));
  return lines.join('\n');
}

export function ReachDot({ up }: { up: boolean | undefined }) {
  if (up === undefined) return null;
  return (
    <span
      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${up ? 'bg-emerald-400' : 'bg-red-400/90'}`}
      title={up ? 'Reachable' : 'Not reachable'}
    />
  );
}

type DropPos = 'before' | 'after' | 'into';
interface DropTarget {
  key: string;
  pos: DropPos;
}

// Only one drag happens at a time; dragover can't read dataTransfer data.
let dragging: DragItem | null = null;

const INDENT = 14;

export function HostTree({
  tree,
  rootId = '',
  connected,
  collapsed,
  onToggle,
  renamingId,
  onRenameDone,
  actions,
  footer,
  sections = [],
  selection = [],
  onSelectClick,
  onClearSelection,
  reach,
}: HostTreeProps) {
  const selectedKeys = new Set(selection.map((h) => `${h.kind}:${h.id}`));
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const expandTimer = useRef<number | undefined>(undefined);

  const root = rootId ? tree.byId.get(rootId) : null;
  const topFolders = root ? root.folders : tree.folders;
  const topHosts = root ? root.hosts : tree.hosts;

  const clearDrop = () => {
    window.clearTimeout(expandTimer.current);
    setDrop(null);
  };

  const startDrag = (e: DragEvent, item: DragItem) => {
    dragging = item;
    setDraggingKey(`${item.kind}:${item.id}`);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.id);
  };
  const endDrag = () => {
    dragging = null;
    setPaneDrag(null);
    setDraggingKey(null);
    clearDrop();
  };

  const posFromEvent = (e: DragEvent, folderRow: boolean): DropPos => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    if (folderRow) {
      if (dragging?.kind !== 'folder') return 'into';
      return y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'into';
    }
    if (dragging?.kind === 'folder') return 'into'; // means "into this host's folder"
    return y < 0.5 ? 'before' : 'after';
  };

  const overFolder = (e: DragEvent, node: FolderNode) => {
    if (!dragging) return;
    const pos = posFromEvent(e, true);
    if (dragging.kind === 'folder' && pos === 'into' && isInside(tree, dragging.id, node.folder.id)) return;
    if (dragging.kind === 'folder' && dragging.id === node.folder.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const key = `folder:${node.folder.id}`;
    if (drop?.key !== key || drop.pos !== pos) {
      setDrop({ key, pos });
      window.clearTimeout(expandTimer.current);
      if (pos === 'into' && collapsed.has(node.folder.id)) {
        expandTimer.current = window.setTimeout(() => onToggle(node.folder.id), 650);
      }
    }
  };

  const overHost = (e: DragEvent, h: HostItem) => {
    if (!dragging) return;
    if (dragging.kind === 'folder' && h.folderId && isInside(tree, dragging.id, h.folderId)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const pos = posFromEvent(e, false);
    const key = `${h.kind}:${h.id}`;
    if (drop?.key !== key || drop.pos !== pos) setDrop({ key, pos });
  };

  const dropOnFolder = (e: DragEvent, node: FolderNode) => {
    e.preventDefault();
    const item = dragging;
    const pos = drop?.pos ?? 'into';
    endDrag();
    if (!item) return;
    if (pos === 'into') return actions.move(item, node.folder.id, -1);
    const parentId = node.folder.parentId;
    const siblings = (parentId ? tree.byId.get(parentId)?.folders ?? [] : tree.folders).filter((f) => f.folder.id !== item.id);
    const idx = siblings.findIndex((f) => f.folder.id === node.folder.id);
    actions.move(item, parentId, idx + (pos === 'after' ? 1 : 0));
  };

  const dropOnHost = (e: DragEvent, h: HostItem) => {
    e.preventDefault();
    const item = dragging;
    const pos = drop?.pos ?? 'after';
    endDrag();
    if (!item) return;
    if (item.kind === 'folder') return actions.move(item, h.folderId, -1);
    const siblings = (h.folderId ? tree.byId.get(h.folderId)?.hosts ?? [] : tree.hosts).filter(
      (x) => !(x.kind === item.kind && x.id === item.id)
    );
    const idx = siblings.findIndex((x) => x.kind === h.kind && x.id === h.id);
    actions.move(item, h.folderId, idx + (pos === 'after' ? 1 : 0));
  };

  const overRoot = (e: DragEvent) => {
    if (!dragging) return;
    e.preventDefault();
    if (drop?.key !== 'root') setDrop({ key: 'root', pos: 'into' });
  };
  const dropRoot = (e: DragEvent) => {
    e.preventDefault();
    const item = dragging;
    endDrag();
    if (item) actions.move(item, rootId, -1);
  };

  const renderHost = (h: HostItem, depth: number, pinned?: string) => {
    const key = `${h.kind}:${h.id}`;
    const indicator = !pinned && drop?.key === key ? drop.pos : null;
    const selected = selectedKeys.has(key);
    return (
      <div
        key={pinned ? `${pinned}:${key}` : key}
        draggable
        onDragStart={(e) => {
          if (pinned) {
            // Rows in Favorites / Recent only drag onto panes, not within the tree.
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('text/plain', h.id);
          } else startDrag(e, { kind: h.kind, id: h.id });
          if (h.kind === 'ssh') setPaneDrag({ kind: 'host', profile: h.profile });
        }}
        onDragEnd={endDrag}
        onDragOver={pinned ? undefined : (e) => overHost(e, h)}
        onDragLeave={pinned ? undefined : () => drop?.key === key && setDrop(null)}
        onDrop={pinned ? undefined : (e) => dropOnHost(e, h)}
        onContextMenu={(e) => (selected && selection.length > 1 ? actions.selectionMenu(e, selection) : actions.hostMenu(e, h))}
        className={`group relative ${draggingKey === key && !pinned ? 'opacity-40' : ''}`}
      >
        {indicator && indicator !== 'into' && <DropLine pos={indicator} depth={depth} />}
        <button
          className={`w-full flex items-center gap-2.5 py-1 pr-7 rounded-lg text-left transition-colors ${
            selected ? 'bg-accent/15 ring-1 ring-inset ring-accent/40' : 'hover:bg-white/[0.05] active:bg-white/[0.07]'
          }`}
          style={{ paddingLeft: 8 + depth * INDENT }}
          onClick={(e) => {
            if (onSelectClick && (e.ctrlKey || e.metaKey || e.shiftKey)) {
              e.preventDefault();
              onSelectClick(h, e);
              return;
            }
            onClearSelection?.();
            actions.openHost(h);
          }}
          title={hostTooltip(h)}
        >
          <Avatar
            label={h.name}
            colorKey={h.id}
            live={connected.has(h.id)}
            icon={hostIcon(h, 12)}
            size={26}
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 min-w-0 leading-tight">
              <span className="text-[12.5px] font-medium text-gray-200 truncate">{h.name}</span>
              {h.kind === 'ssh' && hostTagColor(h.profile) && (
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: hostTagColor(h.profile) }} title="Color tag" />
              )}
              <ProtoBadge host={h} />
              {h.meta.favorite && <Star size={10} className="flex-shrink-0 text-amber-300 fill-amber-300" />}
              <ReachDot up={reach?.get(key)} />
            </span>
            <span className="block text-2xs text-gray-500 truncate">{hostSubtitle(h)}</span>
          </span>
        </button>
        <button
          className="absolute right-1 top-1/2 -translate-y-1/2 icon-btn w-6 h-6 opacity-0 group-hover:opacity-100"
          onClick={(e) => actions.hostMenu(e, h)}
          title="More"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>
    );
  };

  const renderFolder = (node: FolderNode, depth: number): ReactNode => {
    const f = node.folder;
    const key = `folder:${f.id}`;
    const open = !collapsed.has(f.id);
    const indicator = drop?.key === key ? drop.pos : null;
    const color = f.color || undefined;
    return (
      <div key={key} className={draggingKey === key ? 'opacity-40' : ''}>
        <div
          draggable={renamingId !== f.id}
          onDragStart={(e) => startDrag(e, { kind: 'folder', id: f.id })}
          onDragEnd={endDrag}
          onDragOver={(e) => overFolder(e, node)}
          onDragLeave={() => {
            if (drop?.key === key) clearDrop();
          }}
          onDrop={(e) => dropOnFolder(e, node)}
          onContextMenu={(e) => actions.folderMenu(e, node)}
          className={`group relative flex items-center gap-1.5 h-7 pr-1 rounded-lg cursor-default transition-colors ${
            indicator === 'into' ? 'bg-accent/15 ring-1 ring-inset ring-accent/50' : 'hover:bg-white/[0.04]'
          }`}
          style={{ paddingLeft: 4 + depth * INDENT }}
          onClick={() => renamingId !== f.id && onToggle(f.id)}
        >
          {indicator && indicator !== 'into' && <DropLine pos={indicator} depth={depth} />}
          <ChevronRight size={12} className={`text-gray-600 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
          {open ? (
            <FolderOpen size={14} className="flex-shrink-0" style={{ color: color ?? 'rgb(161 161 170)' }} />
          ) : (
            <FolderIcon size={14} className="flex-shrink-0" style={{ color: color ?? 'rgb(161 161 170)', fill: color ? `${color}33` : 'rgb(161 161 170 / 0.15)' }} />
          )}
          {renamingId === f.id ? (
            <RenameInput
              initial={f.name}
              onDone={(name) => {
                onRenameDone();
                if (name && name !== f.name) actions.renameFolder(f.id, name);
              }}
            />
          ) : (
            <span className="flex-1 min-w-0 truncate text-[12.5px] font-medium text-gray-300">{f.name}</span>
          )}
          {renamingId !== f.id && (
            <>
              <span className="text-2xs text-gray-600 tabular-nums group-hover:hidden pr-1.5">{node.total || ''}</span>
              <button
                className="icon-btn w-6 h-6 hidden group-hover:inline-flex"
                onClick={(e) => {
                  e.stopPropagation();
                  actions.folderMenu(e, node);
                }}
                title="More"
              >
                <MoreHorizontal size={14} />
              </button>
            </>
          )}
        </div>
        {open && (node.folders.length > 0 || node.hosts.length > 0) && (
          <div className="relative">
            {/* guide line, tinted with the folder color */}
            <span
              className="absolute top-0 bottom-1 w-px"
              style={{ left: 10 + depth * INDENT, background: color ? `${color}40` : 'rgb(255 255 255 / 0.06)' }}
            />
            {node.folders.map((child) => renderFolder(child, depth + 1))}
            {node.hosts.map((h) => renderHost(h, depth + 1))}
          </div>
        )}
        {open && node.total === 0 && node.folders.length === 0 && (
          <p className="text-2xs text-gray-600 py-1" style={{ paddingLeft: 26 + depth * INDENT }}>
            Empty — drag hosts here
          </p>
        )}
      </div>
    );
  };

  const renderSection = (sec: TreeSection) => {
    const open = !collapsed.has(sec.id);
    return (
      <div key={sec.id}>
        <div
          className="group flex items-center gap-1.5 h-7 pl-1 pr-1 rounded-lg cursor-default hover:bg-white/[0.04]"
          onClick={() => onToggle(sec.id)}
        >
          <ChevronRight size={12} className={`text-gray-600 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
          {sec.icon}
          <span className="flex-1 min-w-0 truncate text-[12.5px] font-medium text-gray-300">{sec.title}</span>
          <span className="text-2xs text-gray-600 tabular-nums pr-1.5">{sec.hosts.length}</span>
        </div>
        {open && sec.hosts.map((h) => renderHost(h, 1, sec.id))}
      </div>
    );
  };

  return (
    <div className="space-y-px">
      {!rootId && sections.filter((sec) => sec.hosts.length > 0).map(renderSection)}
      {!rootId && sections.some((sec) => sec.hosts.length > 0) && <div className="h-px bg-white/[0.05] mx-2 my-1.5" />}
      {topFolders.map((n) => renderFolder(n, 0))}
      {topHosts.map((h) => renderHost(h, 0))}
      {/* drop zone: move to the top level */}
      <div
        onDragOver={overRoot}
        onDragLeave={() => drop?.key === 'root' && setDrop(null)}
        onDrop={dropRoot}
        className={`rounded-lg transition-colors ${
          !draggingKey
            ? 'min-h-[28px]'
            : drop?.key === 'root'
              ? 'min-h-[40px] border border-dashed border-accent/60 bg-accent/10'
              : 'min-h-[40px] border border-dashed border-white/10'
        }`}
      >
        {draggingKey && <p className="text-center text-2xs text-gray-500 pt-3">Drop here to move to {rootId ? 'this folder' : 'the top level'}</p>}
        {!draggingKey && footer}
      </div>
    </div>
  );
}

function DropLine({ pos, depth }: { pos: 'before' | 'after'; depth: number }) {
  return (
    <span
      className={`pointer-events-none absolute right-1 h-0.5 rounded-full bg-accent shadow-[0_0_6px_rgb(var(--accent))] z-10 ${
        pos === 'before' ? '-top-px' : '-bottom-px'
      }`}
      style={{ left: 8 + depth * INDENT }}
    />
  );
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (name: string) => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (v: string) => {
    if (done.current) return;
    done.current = true;
    onDone(v.trim());
  };
  return (
    <input
      ref={ref}
      className="flex-1 min-w-0 h-6 px-1.5 rounded-md bg-black/40 border border-accent/60 text-[12.5px] text-gray-100 outline-none"
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(value);
        if (e.key === 'Escape') finish(initial);
      }}
      onBlur={() => finish(value)}
    />
  );
}
