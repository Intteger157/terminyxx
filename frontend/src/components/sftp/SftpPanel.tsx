import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, FolderTree, Laptop, Server, X } from 'lucide-react';
import { FilePane, PARENT, formatSize, paneRows } from './FilePane';
import type { PaneState } from './FilePane';
import { Modal, errorText, useDialogs } from '../ui/Dialogs';
import { RemoteEditor } from './RemoteEditor';
import type { ActivePane, FileEntry, TransferProgress } from '../../types';
import { EventsOn } from '../../../wailsjs/runtime/runtime';
import { isOsFileDrag, onOsFileDrop } from '../../lib/fileDrop';
import {
  GetLocalHome,
  GetRemoteHome,
  ListLocalDir,
  LocalMkdir,
  LocalParentDir,
  LocalRemove,
  LocalRename,
  ReadLocalFile,
  SFTPCancelDragOut,
  SFTPCancelTransfer,
  SFTPListDir,
  SFTPMkdir,
  SFTPPrepareDragOut,
  SFTPReadFile,
  SFTPRemove,
  SFTPRename,
  SFTPStartDragOut,
  SFTPTransfer,
} from '../../../wailsjs/go/main/App';

interface SftpPanelProps {
  connectionId: string;
  visible: boolean;
  onClose: () => void;
  /** Fill the parent (SFTP-only sessions) instead of being a resizable drawer. */
  fill?: boolean;
}

const emptyPane = (path = ''): PaneState => ({ path, entries: [], cursor: 0, selected: new Set(), loading: true, error: null });

const remoteParent = (p: string) => {
  const trimmed = p.replace(/\/+$/, '');
  const i = trimmed.lastIndexOf('/');
  return i <= 0 ? '/' : trimmed.slice(0, i);
};
const remoteJoin = (dir: string, name: string) => (dir.endsWith('/') ? dir + name : `${dir}/${name}`);
const localJoin = (dir: string, name: string) => {
  const sep = dir.includes('\\') ? '\\' : '/';
  return dir.endsWith(sep) ? dir + name : dir + sep + name;
};
const baseName = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? p;

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

const HEIGHT_KEY = 'terminyxx.sftpHeight';

// The rows being dragged between the two panes. dragover can't read
// dataTransfer, so the drag source records them here.
let rowDrag: { connectionId: string; side: ActivePane; paths: string[] } | null = null;
const ROW_DRAG_TYPE = 'application/x-terminyxx-sftp';

/** A small "N items" chip used as the drag image for multi-row drags. */
function dragBadge(e: ReactDragEvent, label: string) {
  const el = document.createElement('div');
  el.textContent = label;
  el.style.cssText =
    'position:fixed;top:-100px;left:-100px;padding:3px 9px;border-radius:6px;font:600 12px Inter,sans-serif;' +
    'color:#fff;background:rgb(var(--accent));box-shadow:0 4px 12px rgba(0,0,0,.4)';
  document.body.appendChild(el);
  e.dataTransfer.setDragImage(el, -8, -8);
  setTimeout(() => el.remove(), 0);
}

function initialHeight(): number {
  try {
    const v = Number(localStorage.getItem(HEIGHT_KEY));
    if (v >= 160) return v;
  } catch {
    // storage unavailable
  }
  return 320;
}

export function SftpPanel({ connectionId, visible, onClose, fill = false }: SftpPanelProps) {
  const dialogs = useDialogs();
  const [local, setLocal] = useState<PaneState>(emptyPane());
  const [remote, setRemote] = useState<PaneState>(emptyPane('/'));
  const [active, setActive] = useState<ActivePane>('remote');
  const [transfer, setTransfer] = useState<TransferProgress | null>(null);
  const [viewer, setViewer] = useState<{ title: string; content: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [height, setHeight] = useState(initialHeight);
  const jobRef = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const localHasParent = local.path !== '' && local.path !== '/';
  const remoteHasParent = remote.path !== '/';
  const localRows = paneRows(local, localHasParent);
  const remoteRows = paneRows(remote, remoteHasParent);

  const loadLocal = useCallback(
    async (dir: string, focusName?: string) => {
      setLocal((s) => ({ ...s, loading: true }));
      try {
        const entries = (await ListLocalDir(dir)) ?? [];
        const hasParent = dir !== '' && dir !== '/';
        const idx = focusName ? entries.findIndex((e) => e.name === focusName) : -1;
        setLocal({ path: dir, entries, cursor: idx >= 0 ? idx + (hasParent ? 1 : 0) : 0, selected: new Set(), loading: false, error: null });
      } catch (err) {
        setLocal((s) => ({ ...s, loading: false, error: errorText(err) }));
      }
    },
    []
  );

  const loadRemote = useCallback(
    async (dir: string, focusName?: string) => {
      setRemote((s) => ({ ...s, loading: true }));
      try {
        const entries = (await SFTPListDir(connectionId, dir)) ?? [];
        const idx = focusName ? entries.findIndex((e) => e.name === focusName) : -1;
        setRemote({ path: dir, entries, cursor: idx >= 0 ? idx + (dir !== '/' ? 1 : 0) : 0, selected: new Set(), loading: false, error: null });
      } catch (err) {
        setRemote((s) => ({ ...s, loading: false, error: errorText(err) }));
      }
    },
    [connectionId]
  );

  useEffect(() => {
    GetLocalHome().then((h) => loadLocal(h)).catch(() => loadLocal(''));
    GetRemoteHome(connectionId)
      .then((h) => loadRemote(h || '/'))
      .catch(() => loadRemote('/'));
  }, [connectionId, loadLocal, loadRemote]);

  useEffect(() => {
    if (visible) rootRef.current?.focus();
  }, [visible]);

  useEffect(
    () =>
      EventsOn(`sftp:progress:${connectionId}`, (p: TransferProgress) => {
        if (p.jobId === jobRef.current) setTransfer(p);
      }),
    [connectionId]
  );

  const pane = active === 'local' ? local : remote;
  const rows = active === 'local' ? localRows : remoteRows;
  const setPane = active === 'local' ? setLocal : setRemote;

  const targets = (p: PaneState, r: FileEntry[]): FileEntry[] => {
    if (p.selected.size > 0) return p.entries.filter((e) => p.selected.has(e.path));
    const cur = r[p.cursor];
    return cur && cur.name !== PARENT ? [cur] : [];
  };

  const refreshBoth = () => {
    loadLocal(local.path);
    loadRemote(remote.path);
  };

  const goUp = (which: ActivePane) => {
    if (which === 'remote') {
      if (remoteHasParent) loadRemote(remoteParent(remote.path), baseName(remote.path));
    } else if (localHasParent) {
      const from = local.path;
      LocalParentDir(from).then((parent) => loadLocal(parent, baseName(from)));
    }
  };

  const open = async (which: ActivePane, entry: FileEntry) => {
    if (entry.name === PARENT) return goUp(which);
    if (entry.isDir) return which === 'local' ? loadLocal(entry.path) : loadRemote(entry.path);
    await view(which, entry);
  };

  const view = async (which: ActivePane, entry: FileEntry) => {
    if (entry.isDir || entry.name === PARENT) return;
    try {
      const content = which === 'local' ? await ReadLocalFile(entry.path) : await SFTPReadFile(connectionId, entry.path);
      setViewer({ title: entry.path, content });
    } catch (err) {
      const msg = errorText(err);
      dialogs.toast(msg.includes('binary') ? 'Binary file — preview not available' : msg, 'error');
    }
  };

  /**
   * Copies (or moves) `sources` between this computer and the server.
   * `ask` always shows the confirmation (F5/F6); drag and drop only asks when
   * something would be overwritten.
   */
  const startTransfer = async (opts: {
    upload: boolean;
    sources: string[];
    destDir: string;
    move: boolean;
    ask: boolean;
    destEntries?: FileEntry[];
  }) => {
    const { upload, sources, destDir, move, ask } = opts;
    if (sources.length === 0) return;
    if (jobRef.current) {
      dialogs.toast('Wait for the current transfer to finish', 'info');
      return;
    }
    if (!upload && destDir === '') {
      dialogs.toast('Open a folder in the local pane first', 'info');
      return;
    }
    let destEntries = opts.destEntries;
    if (!destEntries) {
      try {
        destEntries = (upload ? await SFTPListDir(connectionId, destDir) : await ListLocalDir(destDir)) ?? [];
      } catch {
        destEntries = [];
      }
    }
    const names = sources.map(baseName);
    const existing = new Set(destEntries.map((d) => d.name));
    const conflicts = names.filter((n) => existing.has(n)).length;
    const verb = move ? 'Move' : 'Copy';
    const label = names.length === 1 ? `“${names[0]}”` : `${names.length} items`;
    if (ask || conflicts > 0) {
      const ok = await dialogs.confirm({
        title: `${verb} ${upload ? 'to server' : 'to this computer'}`,
        confirmLabel: conflicts > 0 && !ask ? 'Overwrite' : verb,
        danger: conflicts > 0,
        message: (
          <>
            <p>
              {label} → <code className="text-accent">{destDir}</code>
            </p>
            {conflicts > 0 && <p className="text-amber-300 text-xs">Will be overwritten: {conflicts}</p>}
          </>
        ),
      });
      if (!ok) return;
    }

    const jobId = crypto.randomUUID();
    jobRef.current = jobId;
    setTransfer({
      jobId, connectionId, direction: upload ? 'upload' : 'download', currentFile: '', filesDone: 0, filesTotal: 0,
      bytesDone: 0, bytesTotal: 0, done: false, error: '',
    });
    try {
      await SFTPTransfer(connectionId, { jobId, direction: upload ? 'upload' : 'download', sources, destDir, move });
      dialogs.toast(`${move ? 'Moved' : 'Copied'}: ${names.length === 1 ? names[0] : `${names.length} items`}`, 'success');
    } catch (err) {
      const msg = errorText(err);
      dialogs.toast(msg.includes('context canceled') ? 'Transfer cancelled' : `Transfer failed: ${msg}`, msg.includes('context canceled') ? 'info' : 'error');
    } finally {
      jobRef.current = null;
      setTransfer(null);
      refreshBoth();
    }
  };

  const runTransfer = (move: boolean) => {
    const upload = active === 'local';
    return startTransfer({
      upload,
      sources: targets(pane, rows).map((i) => i.path),
      destDir: upload ? remote.path : local.path,
      destEntries: upload ? remote.entries : local.entries,
      move,
      ask: true,
    });
  };

  // Files dropped from Explorer / Finder onto the server pane are uploaded.
  const osDropRef = useRef<(paths: string[], dir: string | null) => void>(() => {});
  osDropRef.current = (paths, dir) => {
    setActive('remote');
    rootRef.current?.focus();
    void startTransfer({
      upload: true,
      sources: paths,
      destDir: dir ?? remote.path,
      destEntries: dir ? undefined : remote.entries,
      move: false,
      ask: false,
    });
  };
  useEffect(() => onOsFileDrop(`sftp-${connectionId}`, (paths, dir) => osDropRef.current(paths, dir)), [connectionId]);

  const canDrop = (which: ActivePane) => (e: ReactDragEvent) => {
    if (isOsFileDrag(e.dataTransfer)) return which === 'remote';
    return !!rowDrag && rowDrag.connectionId === connectionId && rowDrag.side !== which;
  };

  const dropItems = (which: ActivePane) => (dir: string | null, e: ReactDragEvent) => {
    // OS files arrive through the Wails file-drop callback, with resolved paths.
    if (isOsFileDrag(e.dataTransfer) || !rowDrag || rowDrag.side === which) return;
    const { paths } = rowDrag;
    rowDrag = null;
    const upload = which === 'remote';
    const st = upload ? remote : local;
    setActive(which);
    rootRef.current?.focus();
    void startTransfer({
      upload,
      sources: paths,
      destDir: dir ?? st.path,
      destEntries: dir ? undefined : st.entries,
      move: e.shiftKey,
      ask: false,
    });
  };

  const rowDragStart = (which: ActivePane) => (i: number, e: ReactDragEvent) => {
    const st = which === 'local' ? local : remote;
    const r = which === 'local' ? localRows : remoteRows;
    const entry = r[i];
    if (!entry || entry.name === PARENT || (which === 'local' && local.path === '')) {
      e.preventDefault();
      return;
    }
    // Dragging a selected row drags the whole selection, otherwise just that row.
    const paths = st.selected.has(entry.path) ? st.entries.filter((x) => st.selected.has(x.path)).map((x) => x.path) : [entry.path];
    rowDrag = { connectionId, side: which, paths };
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData(ROW_DRAG_TYPE, paths.join('\n'));
    if (paths.length > 1) dragBadge(e, `${paths.length} items`);
  };

  // Server rows are dragged with the pointer rather than HTML5 drag and drop:
  // an HTML5 drag belongs to the webview and can't hand files to Explorer. Over
  // the local pane the drop is a download; once the pointer leaves the window
  // with the button still held, the OS drag takes over (internal/dragout) and
  // the files are streamed from the server when they are dropped.
  const dragCtx = useRef({ remote, remoteRows, local, startTransfer });
  dragCtx.current = { remote, remoteRows, local, startTransfer };

  const remotePointerDrag = (index: number, down: ReactMouseEvent) => {
    if (down.button !== 0) return;
    const sx = down.clientX;
    const sy = down.clientY;
    let drag: { paths: string[]; token: Promise<string | null>; ghost: HTMLElement; hover: HTMLElement | null } | null = null;
    let finished = false;

    const setHover = (el: HTMLElement | null) => {
      if (!drag || drag.hover === el) return;
      drag.hover?.removeAttribute('data-drag-hover');
      el?.setAttribute('data-drag-hover', '');
      drag.hover = el;
    };
    const cancelToken = () => {
      void drag?.token.then((tk) => {
        if (tk) void SFTPCancelDragOut(tk);
      });
    };
    const finish = () => {
      finished = true;
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
      window.removeEventListener('keydown', onKey, true);
      if (drag) {
        setHover(null);
        drag.ghost.remove();
      }
      document.body.style.cursor = '';
    };
    const dropTarget = (x: number, y: number) => {
      const under = document.elementFromPoint(x, y) as HTMLElement | null;
      const pane = under?.closest<HTMLElement>('[data-pane="local"]');
      if (!pane || pane.dataset.driveList) return null;
      const row = under?.closest<HTMLElement>('[data-drop-dir]');
      return { pane, row: row && pane.contains(row) ? row : null };
    };
    const begin = () => {
      const { remote: st, remoteRows: rows } = dragCtx.current;
      const entry = rows[index];
      if (!entry || entry.name === PARENT) {
        finish();
        return;
      }
      const paths = st.selected.has(entry.path) ? st.entries.filter((x) => st.selected.has(x.path)).map((x) => x.path) : [entry.path];
      const ghost = document.createElement('div');
      ghost.textContent = paths.length > 1 ? `${paths.length} items` : entry.name;
      ghost.style.cssText =
        'position:fixed;z-index:9999;pointer-events:none;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
        'padding:3px 9px;border-radius:6px;font:600 12px Inter,sans-serif;color:#fff;background:rgb(var(--accent));' +
        'box-shadow:0 4px 12px rgba(0,0,0,.4)';
      document.body.appendChild(ghost);
      document.body.style.cursor = 'copy';
      // Start listing the selection now so the OS drag can begin the moment the pointer leaves.
      const token = isMac ? Promise.resolve(null) : SFTPPrepareDragOut(connectionId, paths).catch(() => null);
      drag = { paths, token, ghost, hover: null };
    };
    const onMove = (ev: MouseEvent) => {
      if (finished) return;
      if ((ev.buttons & 1) === 0) {
        // The button was released where we couldn't see it.
        cancelToken();
        finish();
        return;
      }
      if (!drag) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        begin();
        if (!drag) return;
      }
      drag.ghost.style.left = `${ev.clientX + 12}px`;
      drag.ghost.style.top = `${ev.clientY + 12}px`;
      const outside = ev.clientX < 0 || ev.clientY < 0 || ev.clientX >= window.innerWidth || ev.clientY >= window.innerHeight;
      if (outside) {
        const { token } = drag;
        finish();
        if (isMac) {
          dialogs.toast('Dragging out to Finder is not supported yet. Drop on the Local pane, or press F5.', 'info');
          return;
        }
        void token.then(async (tk) => {
          if (!tk) {
            dialogs.toast('Could not start the drag', 'error');
            return;
          }
          try {
            await SFTPStartDragOut(tk);
          } catch (err) {
            dialogs.toast(`Drag failed: ${errorText(err)}`, 'error');
          }
        });
        return;
      }
      const target = dropTarget(ev.clientX, ev.clientY);
      setHover(target ? (target.row ?? target.pane) : null);
    };
    const onUp = (ev: MouseEvent) => {
      if (finished) return;
      const d = drag;
      const target = d ? dropTarget(ev.clientX, ev.clientY) : null;
      cancelToken();
      finish();
      if (!d || !target) return; // a plain click, or released over nothing
      const { local: lo, startTransfer: run } = dragCtx.current;
      const dir = target.row?.dataset.dropDir ?? null;
      setActive('local');
      rootRef.current?.focus();
      void run({
        upload: false,
        sources: d.paths,
        destDir: dir ?? lo.path,
        destEntries: dir ? undefined : lo.entries,
        move: ev.shiftKey,
        ask: false,
      });
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || finished) return;
      ev.stopPropagation();
      cancelToken();
      finish();
    };
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
    window.addEventListener('keydown', onKey, true);
  };

  const mkdir = async () => {
    if (active === 'local' && local.path === '') return;
    const name = await dialogs.prompt({ title: 'New folder', label: `In ${pane.path}`, confirmLabel: 'Create' });
    if (!name) return;
    try {
      if (active === 'remote') {
        await SFTPMkdir(connectionId, remoteJoin(remote.path, name));
        await loadRemote(remote.path, name);
      } else {
        await LocalMkdir(localJoin(local.path, name));
        await loadLocal(local.path, name);
      }
    } catch (err) {
      dialogs.toast(`Could not create folder: ${errorText(err)}`, 'error');
    }
  };

  const rename = async () => {
    const cur = rows[pane.cursor];
    if (!cur || cur.name === PARENT || (active === 'local' && local.path === '')) return;
    const name = await dialogs.prompt({ title: 'Rename', defaultValue: cur.name, confirmLabel: 'Rename' });
    if (!name || name === cur.name) return;
    try {
      if (active === 'remote') {
        await SFTPRename(connectionId, cur.path, remoteJoin(remote.path, name));
        await loadRemote(remote.path, name);
      } else {
        await LocalRename(cur.path, localJoin(local.path, name));
        await loadLocal(local.path, name);
      }
    } catch (err) {
      dialogs.toast(`Rename failed: ${errorText(err)}`, 'error');
    }
  };

  const remove = async () => {
    const items = targets(pane, rows);
    if (items.length === 0 || (active === 'local' && local.path === '')) return;
    const ok = await dialogs.confirm({
      title: active === 'remote' ? 'Delete on server' : 'Delete on this computer',
      danger: true,
      confirmLabel: 'Delete',
      message: (
        <>
          <p>{items.length === 1 ? `Delete “${items[0].name}”?` : `Delete ${items.length} items?`}</p>
          {items.some((i) => i.isDir) && <p className="text-xs text-amber-300">Folders are deleted with all their contents.</p>}
          <p className="text-xs text-gray-500">This cannot be undone.</p>
        </>
      ),
    });
    if (!ok) return;
    try {
      for (const it of items) {
        if (active === 'remote') await SFTPRemove(connectionId, it.path);
        else await LocalRemove(it.path);
      }
    } catch (err) {
      dialogs.toast(`Delete failed: ${errorText(err)}`, 'error');
    }
    if (active === 'remote') loadRemote(remote.path);
    else loadLocal(local.path);
  };

  const toggleSelect = (which: ActivePane, entry: FileEntry) => {
    if (entry.name === PARENT) return;
    const set = which === 'local' ? setLocal : setRemote;
    set((s) => {
      const selected = new Set(s.selected);
      if (selected.has(entry.path)) selected.delete(entry.path);
      else selected.add(entry.path);
      return { ...s, selected };
    });
  };

  /** Adds rows a..b (inclusive, either order) to `into`, skipping "..". */
  const rangePaths = (r: FileEntry[], a: number, b: number, into: Set<string>) => {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    for (let k = lo; k <= hi; k++) if (r[k] && r[k].name !== PARENT) into.add(r[k].path);
    return into;
  };

  /** Arrow keys etc.; with Shift the selection becomes the range from the anchor. */
  const moveCursor = (delta: number | 'home' | 'end', extend = false) => {
    setPane((s) => {
      const max = rows.length - 1;
      const next = delta === 'home' ? 0 : delta === 'end' ? max : Math.max(0, Math.min(max, s.cursor + delta));
      if (!extend) return { ...s, cursor: next, anchor: next };
      const anchor = s.anchor ?? s.cursor;
      return { ...s, cursor: next, anchor, selected: rangePaths(rows, anchor, next, new Set()) };
    });
  };

  // Explorer-style mouse selection: click selects one row, Ctrl/Cmd+click
  // toggles, Shift+click selects a range (Ctrl+Shift adds the range).
  const rowMouseDown = (which: ActivePane) => (i: number, e: ReactMouseEvent) => {
    const set = which === 'local' ? setLocal : setRemote;
    const r = which === 'local' ? localRows : remoteRows;
    const entry = r[i];
    if (!entry) return;
    const mod = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    if (shift) e.preventDefault(); // no text selection
    set((s) => {
      if (shift) {
        const anchor = s.anchor ?? s.cursor;
        return { ...s, cursor: i, anchor, selected: rangePaths(r, anchor, i, mod ? new Set(s.selected) : new Set()) };
      }
      if (mod) {
        const selected = new Set(s.selected);
        if (entry.name !== PARENT) {
          if (selected.has(entry.path)) selected.delete(entry.path);
          else selected.add(entry.path);
        }
        return { ...s, cursor: i, anchor: i, selected };
      }
      // A plain press on a selected row keeps the selection so it can be
      // dragged; the click that follows (when no drag happens) narrows it.
      if (s.selected.has(entry.path)) return { ...s, cursor: i, anchor: i };
      return { ...s, cursor: i, anchor: i, selected: s.selected.size ? new Set() : s.selected };
    });
  };

  const rowClick = (which: ActivePane) => (i: number, e: ReactMouseEvent) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) return;
    const set = which === 'local' ? setLocal : setRemote;
    set((s) => (s.selected.size > 0 ? { ...s, cursor: i, anchor: i, selected: new Set() } : s));
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (viewer || editing) return;
    const cur = rows[pane.cursor];
    const mod = e.ctrlKey || e.metaKey;
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };

    switch (e.key) {
      case 'ArrowDown': handled(); return moveCursor(1, e.shiftKey);
      case 'ArrowUp': handled(); return moveCursor(-1, e.shiftKey);
      case 'PageDown': handled(); return moveCursor(15, e.shiftKey);
      case 'PageUp': handled(); return moveCursor(-15, e.shiftKey);
      case 'Home': handled(); return moveCursor('home', e.shiftKey);
      case 'End': handled(); return moveCursor('end', e.shiftKey);
      case 'Tab': handled(); return setActive((a) => (a === 'local' ? 'remote' : 'local'));
      case 'Enter': handled(); if (cur) void open(active, cur); return;
      case 'Backspace': handled(); return goUp(active);
      case ' ':
      case 'Insert':
        handled();
        if (cur) toggleSelect(active, cur);
        return moveCursor(1);
      case 'F3': handled(); if (cur) void view(active, cur); return;
      case 'F4':
        handled();
        if (active !== 'remote') dialogs.toast('F4 edits files on the server. Local files open in your own editor.', 'info');
        else if (cur && !cur.isDir && cur.name !== PARENT) setEditing(cur.path);
        return;
      case 'F5': handled(); void runTransfer(false); return;
      case 'F6': handled(); if (e.shiftKey) void rename(); else void runTransfer(true); return;
      case 'F2': handled(); void rename(); return;
      case 'F7': handled(); void mkdir(); return;
      case 'F8':
      case 'Delete': handled(); void remove(); return;
    }
    if (mod && e.code === 'KeyA') {
      handled();
      if (active === 'local' && local.path === '') return;
      setPane((s) => ({ ...s, selected: new Set(s.entries.map((x) => x.path)) }));
    } else if (mod && e.code === 'KeyR') {
      handled();
      refreshBoth();
    }
  };

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    let h = startH;
    const onMove = (ev: MouseEvent) => {
      h = Math.max(160, Math.min(window.innerHeight * 0.8, startH + (startY - ev.clientY)));
      setHeight(h);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      try {
        localStorage.setItem(HEIGHT_KEY, String(Math.round(h)));
      } catch {
        // ignore
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const pct = transfer && transfer.bytesTotal > 0 ? Math.min(100, (transfer.bytesDone / transfer.bytesTotal) * 100) : 0;

  const hints: [string, string][] = [
    ['F3', 'View'],
    ['F4', 'Edit'],
    ['F5', 'Copy'],
    ['F6', 'Move'],
    ['F7', 'New folder'],
    ['F8', 'Delete'],
    ['Space', 'Select'],
    ['Shift', 'Range'],
    ['Tab', 'Switch'],
  ];

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={`card relative flex-col outline-none overflow-hidden focus-visible:outline-none ${
        fill ? 'absolute inset-0' : 'flex-shrink-0 animate-slide-up'
      } ${visible ? 'flex' : 'hidden'}`}
      style={fill ? undefined : { height }}
    >
      {/* resize handle */}
      {!fill && (
        <div className="group absolute top-0 left-0 right-0 h-2 cursor-row-resize z-10 flex justify-center" onMouseDown={startResize}>
          <span className="mt-[3px] w-10 h-1 rounded-full bg-white/10 group-hover:bg-accent/60 transition-colors" />
        </div>
      )}

      <div className="flex items-center gap-3 pl-3 pr-1.5 pt-2.5 pb-1.5">
        <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-gray-200">
          <FolderTree size={14} className="text-accent" /> Files
        </span>
        <div className="flex items-center gap-2.5 min-w-0 overflow-hidden text-2xs text-gray-500">
          {hints.map(([k, label]) => (
            <span key={k} className="flex items-center gap-1 whitespace-nowrap">
              <span className="kbd">{k}</span>
              {label}
            </span>
          ))}
        </div>
        <div className="flex-1" />
        {!fill && (
          <button className="icon-btn" onClick={onClose} title="Close (Ctrl+Shift+F)" tabIndex={-1}>
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex flex-1 gap-2 px-2 pb-2 min-h-0">
        {(['local', 'remote'] as const).map((which) => {
          const st = which === 'local' ? local : remote;
          const r = which === 'local' ? localRows : remoteRows;
          return (
            <FilePane
              key={which}
              title={which === 'local' ? 'Local' : 'Server'}
              side={which}
              icon={which === 'local' ? <Laptop size={12} /> : <Server size={12} />}
              state={st}
              rows={r}
              active={active === which}
              isDriveList={which === 'local' && st.path === ''}
              onActivate={() => {
                setActive(which);
                rootRef.current?.focus();
              }}
              onRowMouseDown={rowMouseDown(which)}
              onRowClick={rowClick(which)}
              onRowDragStart={rowDragStart(which)}
              onRowDragEnd={() => {
                rowDrag = null;
              }}
              onRowPointerDown={which === 'remote' ? remotePointerDrag : undefined}
              canDrop={canDrop(which)}
              onDropItems={dropItems(which)}
              fileDropId={which === 'remote' ? `sftp-${connectionId}` : undefined}
              onOpen={(entry) => void open(which, entry)}
              onGoUp={() => goUp(which)}
              onNavigate={(p) => (which === 'local' ? loadLocal(p) : loadRemote(p || '/'))}
              onRefresh={() => (which === 'local' ? loadLocal(st.path) : loadRemote(st.path))}
            />
          );
        })}
      </div>

      {transfer && (
        <div className="flex items-center gap-3 mx-2 mb-2 px-3 py-2 rounded-lg bg-accent/[0.07] ring-1 ring-inset ring-accent/20 text-2xs animate-slide-up">
          <span className="flex items-center justify-center w-6 h-6 rounded-md bg-accent/15 text-accent">
            {transfer.direction === 'upload' ? <ArrowUpFromLine size={13} /> : <ArrowDownToLine size={13} />}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between text-gray-300">
              <span className="truncate font-medium">
                {transfer.direction === 'upload' ? 'Uploading' : 'Downloading'}{' '}
                <span className="text-gray-400 font-normal">{transfer.currentFile ? baseName(transfer.currentFile) : 'Preparing…'}</span>
              </span>
              <span className="tabular-nums flex-shrink-0 ml-2 text-gray-400">
                {transfer.filesDone}/{transfer.filesTotal} · {formatSize(transfer.bytesDone)} / {formatSize(transfer.bytesTotal)} · {Math.round(pct)}%
              </span>
            </div>
            <div className="h-1 mt-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-fuchsia-400 transition-[width] duration-150 shadow-[0_0_8px_rgb(var(--accent)/0.6)]"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <button className="btn-ghost h-6 px-2 text-2xs hover:text-red-300" onClick={() => SFTPCancelTransfer(transfer.jobId)} tabIndex={-1}>
            Cancel
          </button>
        </div>
      )}

      {editing && (
        <RemoteEditor
          connectionId={connectionId}
          path={editing}
          onClose={() => {
            setEditing(null);
            rootRef.current?.focus();
            void loadRemote(remote.path);
          }}
        />
      )}

      {viewer && (
        <Modal
          title={baseName(viewer.title)}
          subtitle={<span className="font-mono">{viewer.title}</span>}
          onClose={() => {
            setViewer(null);
            rootRef.current?.focus();
          }}
          width="max-w-4xl"
        >
          <pre className="mx-5 mb-5 p-4 rounded-xl bg-black/30 border border-white/[0.05] overflow-auto text-[12px] leading-relaxed text-gray-300 max-h-[65vh] whitespace-pre-wrap break-words font-mono">
            {viewer.content}
          </pre>
        </Modal>
      )}
    </div>
  );
}
