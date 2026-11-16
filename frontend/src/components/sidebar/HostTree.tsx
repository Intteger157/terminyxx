import { useEffect, useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { ChevronRight, Folder as FolderIcon, FolderOpen, Monitor, MoreHorizontal } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import type { DragItem, FolderNode, HostItem, Tree } from './tree';
import { isInside } from './tree';
import { setPaneDrag } from '../../lib/paneDrag';

export interface TreeActions {
  openHost: (h: HostItem) => void;
  hostMenu: (e: React.MouseEvent, h: HostItem) => void;
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
}

type DropPos = 'before' | 'after' | 'into';
interface DropTarget {
  key: string;
  pos: DropPos;
}

// Only one drag happens at a time; dragover can't read dataTransfer data.
let dragging: DragItem | null = null;

const INDENT = 14;

export function HostTree({ tree, rootId = '', connected, collapsed, onToggle, renamingId, onRenameDone, actions, footer }: HostTreeProps) {
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

  const renderHost = (h: HostItem, depth: number) => {
    const key = `${h.kind}:${h.id}`;
    const indicator = drop?.key === key ? drop.pos : null;
    return (
      <div
        key={key}
        draggable
        onDragStart={(e) => {
          startDrag(e, { kind: h.kind, id: h.id });
          if (h.kind === 'ssh') setPaneDrag({ kind: 'host', profile: h.profile });
        }}
        onDragEnd={endDrag}
        onDragOver={(e) => overHost(e, h)}
        onDragLeave={() => drop?.key === key && setDrop(null)}
        onDrop={(e) => dropOnHost(e, h)}
        onContextMenu={(e) => actions.hostMenu(e, h)}
        className={`group relative ${draggingKey === key ? 'opacity-40' : ''}`}
      >
        {indicator && indicator !== 'into' && <DropLine pos={indicator} depth={depth} />}
        <button
          className="w-full flex items-center gap-2.5 py-1 pr-7 rounded-lg text-left hover:bg-white/[0.05] active:bg-white/[0.07] transition-colors"
          style={{ paddingLeft: 8 + depth * INDENT }}
          onClick={() => actions.openHost(h)}
          title={h.detail}
        >
          <Avatar
            label={h.name}
            colorKey={h.id}
            live={connected.has(h.id)}
            icon={h.kind === 'rdp' ? <Monitor size={12} /> : undefined}
            size={26}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-medium text-gray-200 truncate leading-tight">{h.name}</span>
            <span className="block text-2xs text-gray-500 truncate">{h.detail}</span>
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

  return (
    <div className="space-y-px">
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
