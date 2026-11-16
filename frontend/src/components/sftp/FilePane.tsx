import { useEffect, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import {
  ArrowUp,
  ChevronRight,
  File,
  FileArchive,
  FileCode,
  FileImage,
  FileSymlink,
  FileText,
  Folder,
  FolderSymlink,
  HardDrive,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import type { FileEntry } from '../../types';

export const PARENT = '..';

export interface PaneState {
  path: string;
  entries: FileEntry[];
  cursor: number; // index into rows (row 0 may be "..")
  selected: Set<string>;
  anchor?: number; // row where a Shift range selection starts
  loading: boolean;
  error: string | null;
}

export function paneRows(p: PaneState, hasParent: boolean): FileEntry[] {
  return hasParent
    ? [{ name: PARENT, path: PARENT, isDir: true, isLink: false, size: 0, mode: '', modTime: '' }, ...p.entries]
    : p.entries;
}

interface FilePaneProps {
  title: string;
  icon: ReactNode;
  state: PaneState;
  rows: FileEntry[];
  active: boolean;
  isDriveList?: boolean;
  onActivate: () => void;
  /** Mouse down on a row: moves the cursor and applies Ctrl/Shift selection. */
  onRowMouseDown: (index: number, e: ReactMouseEvent) => void;
  /** Plain click (no drag) on a row. */
  onRowClick: (index: number, e: ReactMouseEvent) => void;
  /** Start dragging a row (and the selection it belongs to). */
  onRowDragStart: (index: number, e: ReactDragEvent) => void;
  onRowDragEnd: () => void;
  /** Whether the current drag can be dropped here; `dir` is a folder row under the cursor. */
  canDrop: (e: ReactDragEvent) => boolean;
  /** An in-app drop; `dir` is the folder row dropped on, or null for the current folder. */
  onDropItems: (dir: string | null, e: ReactDragEvent) => void;
  /** Marks the pane as a target for files dragged in from the OS (see lib/fileDrop.ts). */
  fileDropId?: string;
  onOpen: (entry: FileEntry) => void;
  onGoUp: () => void;
  onNavigate: (path: string) => void;
  onRefresh: () => void;
}

export function FilePane({
  title,
  icon,
  state,
  rows,
  active,
  isDriveList,
  onActivate,
  onRowMouseDown,
  onRowClick,
  onRowDragStart,
  onRowDragEnd,
  canDrop,
  onDropItems,
  fileDropId,
  onOpen,
  onGoUp,
  onNavigate,
  onRefresh,
}: FilePaneProps) {
  const listRef = useRef<HTMLDivElement>(null);
  // Drop highlight: the folder row under the cursor, or 'pane' for the current folder.
  const [dropAt, setDropAt] = useState<number | 'pane' | null>(null);

  // A drop handled natively (OS files) may not reach this element; clear on any drop.
  useEffect(() => {
    if (dropAt === null) return;
    const clear = () => setDropAt(null);
    window.addEventListener('drop', clear);
    window.addEventListener('dragend', clear);
    return () => {
      window.removeEventListener('drop', clear);
      window.removeEventListener('dragend', clear);
    };
  }, [dropAt]);

  const folderRowAt = (target: EventTarget | null): number | null => {
    const el = (target as HTMLElement | null)?.closest<HTMLElement>('[data-drop-dir]');
    if (!el) return null;
    const i = Number(el.dataset.row);
    return Number.isNaN(i) ? null : i;
  };

  const onDragOver = (e: ReactDragEvent) => {
    if (!canDrop(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = e.shiftKey && !Array.from(e.dataTransfer.types).includes('Files') ? 'move' : 'copy';
    const row = folderRowAt(e.target);
    const next = row ?? 'pane';
    if (next !== dropAt) setDropAt(next);
  };

  const onDragLeave = (e: ReactDragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropAt(null);
  };

  const onDrop = (e: ReactDragEvent) => {
    setDropAt(null);
    if (!canDrop(e)) return;
    e.preventDefault();
    const row = folderRowAt(e.target);
    onDropItems(row !== null ? rows[row]?.path ?? null : null, e);
  };

  // Keep the cursor row visible while moving with the keyboard.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row="${state.cursor}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [state.cursor]);

  const selectedCount = state.selected.size;
  const selectedBytes = state.entries.filter((e) => state.selected.has(e.path)).reduce((s, e) => s + (e.isDir ? 0 : e.size), 0);

  return (
    <div
      className={`flex flex-col flex-1 min-w-0 rounded-lg border transition-colors ${
        dropAt === 'pane'
          ? 'border-accent bg-accent/[0.06] shadow-[0_0_0_3px_rgb(var(--accent)/0.18)]'
          : active
            ? 'border-accent/40 bg-black/25 shadow-[0_0_0_3px_rgb(var(--accent)/0.08)]'
            : 'border-white/[0.05] bg-black/15'
      }`}
      onMouseDown={onActivate}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      data-file-drop={fileDropId}
    >
      <div className="flex items-center gap-1 px-1.5 h-9 border-b border-white/[0.05]">
        <span
          className={`flex items-center gap-1 h-5 px-1.5 rounded-md text-2xs font-semibold uppercase tracking-[0.06em] ${
            active ? 'text-accent bg-accent/10' : 'text-gray-500'
          }`}
        >
          {icon}
          {title}
        </span>
        <button className="icon-btn w-6 h-6" onClick={onGoUp} title="Up (Backspace)" tabIndex={-1}>
          <ArrowUp size={13} />
        </button>
        <PathBar path={state.path} placeholder={isDriveList ? 'This PC' : ''} onNavigate={onNavigate} />
        <button className="icon-btn w-6 h-6" onClick={onRefresh} title="Refresh (Ctrl+R)" tabIndex={-1}>
          {state.loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        </button>
      </div>

      <div className="grid grid-cols-[1fr_72px_112px] gap-2 px-3 h-6 items-center text-2xs text-gray-600 border-b border-white/[0.03]">
        <span>Name</span>
        <span className="text-right">Size</span>
        <span className="text-right">Modified</span>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto py-1 text-[12.5px] select-none">
        {state.error && (
          <p className="mx-2 my-1 px-2.5 py-2 rounded-md bg-red-500/10 text-2xs text-red-300 break-words">{state.error}</p>
        )}
        {rows.map((entry, i) => {
          const isCursor = i === state.cursor;
          const isSelected = state.selected.has(entry.path);
          const isParent = entry.name === PARENT;
          const isFolderTarget = entry.isDir && !isParent && !isDriveList;
          const isDropRow = dropAt === i;
          return (
            <div
              key={entry.path}
              data-row={i}
              data-drop-dir={isFolderTarget ? entry.path : undefined}
              draggable={!isParent && !isDriveList}
              className={`grid grid-cols-[1fr_72px_112px] gap-2 items-center mx-1 px-2 h-[26px] rounded-md cursor-default ${
                isDropRow
                  ? 'bg-accent/25 ring-1 ring-inset ring-accent text-gray-100'
                  : isCursor && active
                    ? 'bg-accent/[0.16] text-gray-100'
                    : isCursor
                      ? 'bg-white/[0.05]'
                      : isSelected
                        ? 'bg-amber-300/[0.06]'
                        : 'hover:bg-white/[0.03]'
              } ${isSelected ? 'text-amber-300' : isCursor && active ? '' : 'text-gray-300'}`}
              onMouseDown={(e) => {
                if (e.button === 0) onRowMouseDown(i, e);
              }}
              onClick={(e) => onRowClick(i, e)}
              onDragStart={(e) => onRowDragStart(i, e)}
              onDragEnd={onRowDragEnd}
              onDoubleClick={() => onOpen(entry)}
            >
              <span className="flex items-center gap-2 min-w-0">
                <EntryIcon entry={entry} drive={isDriveList} />
                <span className="truncate">{entry.name}</span>
              </span>
              <span className="text-right text-2xs text-gray-500 tabular-nums">{entry.isDir ? '' : formatSize(entry.size)}</span>
              <span className="text-right text-2xs text-gray-600 tabular-nums truncate">{entry.modTime ? formatDate(entry.modTime) : ''}</span>
            </div>
          );
        })}
        {!state.loading && !state.error && rows.length === 0 && <p className="px-4 py-6 text-center text-2xs text-gray-600">Empty folder</p>}
      </div>

      <div className="flex justify-between px-3 h-6 items-center border-t border-white/[0.04] text-2xs text-gray-600">
        <span>{state.entries.length} items</span>
        {selectedCount > 0 && (
          <span className="text-amber-300/90">
            {selectedCount} selected · {formatSize(selectedBytes)}
          </span>
        )}
      </div>
    </div>
  );
}

/** Breadcrumbs that turn into a text field on click. */
function PathBar({ path, placeholder, onNavigate }: { path: string; placeholder: string; onNavigate: (p: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(path);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(path), [path]);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (editing || !path) {
    return (
      <input
        ref={inputRef}
        className={`flex-1 min-w-0 h-6 px-2 rounded-md bg-black/30 border text-2xs font-mono text-gray-200 outline-none ${
          editing ? 'border-accent/40' : 'border-transparent'
        }`}
        value={draft}
        spellCheck={false}
        autoFocus={editing}
        placeholder={placeholder}
        onFocus={() => setEditing(true)}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            onNavigate(draft);
            setEditing(false);
          }
          if (e.key === 'Escape') {
            setDraft(path);
            setEditing(false);
          }
        }}
        onBlur={() => {
          setDraft(path);
          setEditing(false);
        }}
      />
    );
  }

  const win = /^[A-Za-z]:[\\/]/.test(path);
  const parts = path.split(/[\\/]/).filter(Boolean);
  const crumbs = parts.map((name, i) => ({
    name,
    target: win ? parts.slice(0, i + 1).join('\\') + (i === 0 ? '\\' : '') : '/' + parts.slice(0, i + 1).join('/'),
  }));
  if (!win) crumbs.unshift({ name: '/', target: '/' });

  return (
    <div
      className="flex-1 min-w-0 h-6 flex items-center px-1 rounded-md hover:bg-white/[0.04] cursor-text overflow-hidden"
      onClick={() => setEditing(true)}
      title={path}
    >
      {/* rtl keeps the deepest folders visible when the path overflows */}
      <div className="flex items-center min-w-0 overflow-hidden [direction:rtl]">
        <div className="flex items-center gap-0.5 [direction:ltr]">
          {crumbs.map((c, i) => (
            <span key={c.target} className="flex items-center gap-0.5 flex-shrink-0">
              {i > 0 && (win || i > 1) && <ChevronRight size={11} className="text-gray-600" />}
              <button
                className={`px-1 h-5 rounded text-2xs font-mono transition-colors ${
                  i === crumbs.length - 1 ? 'text-gray-200' : 'text-gray-500 hover:text-gray-200 hover:bg-white/[0.06]'
                }`}
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  if (c.target !== path) onNavigate(c.target);
                }}
              >
                {c.name}
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const CODE = /\.(ts|tsx|js|jsx|go|py|rs|rb|php|java|c|h|cpp|cs|sh|bash|zsh|ps1|json|ya?ml|toml|ini|conf|xml|html|css|sql)$/i;
const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i;
const ARCHIVE = /\.(zip|tar|gz|tgz|bz2|xz|7z|rar|zst)$/i;
const TEXT = /\.(txt|md|log|csv|rst)$/i;

function EntryIcon({ entry, drive }: { entry: FileEntry; drive?: boolean }) {
  const cls = 'flex-shrink-0';
  if (entry.name === PARENT) return <ArrowUp size={14} className={`${cls} text-gray-500`} />;
  if (drive) return <HardDrive size={14} className={`${cls} text-gray-400`} />;
  if (entry.isDir) {
    const Icon = entry.isLink ? FolderSymlink : Folder;
    return <Icon size={14} className={`${cls} text-sky-400/90 fill-sky-400/15`} />;
  }
  if (entry.isLink) return <FileSymlink size={14} className={`${cls} text-gray-500`} />;
  if (CODE.test(entry.name)) return <FileCode size={14} className={`${cls} text-violet-300/80`} />;
  if (IMAGE.test(entry.name)) return <FileImage size={14} className={`${cls} text-emerald-300/80`} />;
  if (ARCHIVE.test(entry.name)) return <FileArchive size={14} className={`${cls} text-amber-300/80`} />;
  if (TEXT.test(entry.name)) return <FileText size={14} className={`${cls} text-gray-400`} />;
  return <File size={14} className={`${cls} text-gray-500`} />;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.toDateString() === now.toDateString()) return `Today ${time}`;
  const month = d.toLocaleString('en-US', { month: 'short' });
  return d.getFullYear() === now.getFullYear() ? `${month} ${d.getDate()}, ${time}` : `${month} ${d.getDate()}, ${d.getFullYear()}`;
}
