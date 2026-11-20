import { useEffect, useMemo, useRef, useState } from 'react';
import { ProtoBadge, hostIcon } from './ProtoBadge';
import { Clock, Folder as FolderIcon, FolderPlus, Plus, Search, Star, X } from 'lucide-react';
import type { Folder, RDPProfile, SSHProfile, StreamProfile } from '../../types';
import { Avatar } from '../ui/Avatar';
import { HostTree, ReachDot, hostSubtitle, hostTooltip } from './HostTree';
import type { TreeActions, TreeSection } from './HostTree';
import type { FolderNode, HostItem, MetaMap, Tree } from './tree';
import {
  FAVORITES_ID,
  RECENT_ID,
  buildTree,
  favoriteHosts,
  folderPath,
  hostItems,
  matchesQuery,
  recentHosts,
  visibleHosts,
} from './tree';
import { useSettings } from '../../lib/settings';
import { useReachability } from '../../lib/reach';

export const RAIL_WIDTH = 56;
export const MIN_WIDTH = 220;
export const MAX_WIDTH = 440;
const SNAP_TO_RAIL = 150;
const COLLAPSED_KEY = 'terminyxx.collapsedFolders';

interface SidebarProps {
  width: number;
  rail: boolean;
  onResize: (width: number, rail: boolean) => void;
  folders: Folder[];
  sshProfiles: SSHProfile[];
  rdpProfiles: RDPProfile[];
  streamProfiles: StreamProfile[];
  meta: MetaMap;
  connectedIds: Set<string>;
  renamingId: string | null;
  onRenameDone: () => void;
  actions: TreeActions;
  onNewHost: () => void;
  onNewFolder: () => void;
  onBackgroundMenu: (e: React.MouseEvent) => void;
}

function loadCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

export function Sidebar(props: SidebarProps) {
  const { width, rail, onResize, folders, sshProfiles, rdpProfiles, streamProfiles } = props;
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);
  const [flyout, setFlyout] = useState<{ id: string; top: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const hosts = useMemo(
    () => hostItems(sshProfiles, rdpProfiles, streamProfiles, props.meta),
    [sshProfiles, rdpProfiles, streamProfiles, props.meta]
  );
  const tree = useMemo(() => buildTree(folders, hosts), [folders, hosts]);
  const hostSettings = useSettings().hosts;
  const sections: TreeSection[] = useMemo(
    () => [
      { id: FAVORITES_ID, title: 'Favorites', icon: <Star size={13} className="text-amber-300 fill-amber-300/30" />, hosts: favoriteHosts(hosts) },
      { id: RECENT_ID, title: 'Recent', icon: <Clock size={13} className="text-gray-400" />, hosts: recentHosts(hosts, hostSettings.recentCount) },
    ],
    [hosts, hostSettings.recentCount]
  );

  // Multi-selection (Ctrl/Cmd+click toggles, Shift+click selects a range).
  const [selection, setSelection] = useState<HostItem[]>([]);
  const anchor = useRef<string | null>(null);
  const keyOf = (h: HostItem) => `${h.kind}:${h.id}`;
  // Keep the selection in step with reloaded hosts; drop deleted ones.
  useEffect(() => {
    setSelection((sel) => {
      if (sel.length === 0) return sel;
      const byKey = new Map(hosts.map((h) => [keyOf(h), h]));
      return sel.map((h) => byKey.get(keyOf(h))).filter((h): h is HostItem => !!h);
    });
  }, [hosts]);
  const clearSelection = () => {
    if (selection.length) setSelection([]);
    anchor.current = null;
  };
  const order = useMemo(() => visibleHosts(tree, collapsed), [tree, collapsed]);
  const selectClick = (h: HostItem, e: React.MouseEvent, list: HostItem[] = order) => {
    const k = keyOf(h);
    if (e.shiftKey && anchor.current) {
      const a = list.findIndex((x) => keyOf(x) === anchor.current);
      const b = list.findIndex((x) => keyOf(x) === k);
      if (a >= 0 && b >= 0) {
        const range = list.slice(Math.min(a, b), Math.max(a, b) + 1);
        setSelection((sel) => {
          const keys = new Set(sel.map(keyOf));
          return [...sel, ...range.filter((x) => !keys.has(keyOf(x)))];
        });
        return;
      }
    }
    anchor.current = k;
    setSelection((sel) => (sel.some((x) => keyOf(x) === k) ? sel.filter((x) => keyOf(x) !== k) : [...sel, h]));
  };
  useEffect(() => {
    if (selection.length === 0) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelection([]);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection.length]);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
    } catch {
      // storage unavailable
    }
  }, [collapsed]);

  const toggle = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // A folder that is being renamed must be visible.
  useEffect(() => {
    if (!props.renamingId) return;
    let cur = tree.byId.get(props.renamingId)?.folder.parentId;
    const open: string[] = [];
    for (let g = 0; cur && g < 64; g++) {
      open.push(cur);
      cur = tree.byId.get(cur)?.folder.parentId;
    }
    if (open.some((id) => collapsed.has(id))) setCollapsed((s) => new Set([...s].filter((id) => !open.includes(id))));
    if (rail) setFlyout(null);
  }, [props.renamingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = rail ? RAIL_WIDTH : width;
    const onMove = (ev: MouseEvent) => {
      const w = startW + (ev.clientX - startX);
      // Collapsing keeps the width from before the drag for the next expand.
      if (w < SNAP_TO_RAIL) onResize(width, true);
      else onResize(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w)), false);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handle = (
    <div
      className="group absolute top-0 bottom-0 -right-1 w-2 cursor-col-resize z-20"
      onMouseDown={startResize}
      onDoubleClick={() => onResize(width, !rail)}
      title="Drag to resize · double-click to collapse"
    >
      <span className="absolute inset-y-2 left-[3px] w-[2px] rounded-full bg-transparent group-hover:bg-accent/60 transition-colors" />
    </div>
  );

  const q = query.trim().toLowerCase();
  const results: HostItem[] = q ? hosts.filter((h) => matchesQuery(h, q, folderPath(tree, h.folderId))) : [];
  const shownHosts = useMemo(() => {
    if (rail) return [];
    if (q) return results;
    const seen = new Set<string>();
    return [...sections.flatMap((sec) => (collapsed.has(sec.id) ? [] : sec.hosts)), ...order].filter((h) => {
      const k = keyOf(h);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rail, q, results.length, sections, order, collapsed, tree]);
  const reach = useReachability(shownHosts, hostSettings.availability, hostSettings.availabilitySeconds);

  if (rail) {
    return (
      <aside className="relative flex-shrink-0 flex flex-col items-center gap-1 bg-app pb-2" style={{ width: RAIL_WIDTH }}>
        {handle}
        <button className="icon-btn w-9 h-9" onClick={props.onNewHost} title="New host">
          <Plus size={16} />
        </button>
        <div className="w-6 h-px bg-white/[0.06] my-1" />
        <div className="flex-1 w-full overflow-y-auto flex flex-col items-center gap-1 [&::-webkit-scrollbar]:hidden">
          {tree.folders.map((n) => (
            <button
              key={n.folder.id}
              className={`relative w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                flyout?.id === n.folder.id ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'
              }`}
              title={`${n.folder.name} (${n.total})`}
              onClick={(e) => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setFlyout(flyout?.id === n.folder.id ? null : { id: n.folder.id, top: r.top });
              }}
              onContextMenu={(e) => props.actions.folderMenu(e, n)}
            >
              <FolderIcon
                size={17}
                style={{ color: n.folder.color || 'rgb(161 161 170)', fill: n.folder.color ? `${n.folder.color}33` : 'rgb(161 161 170 / 0.15)' }}
              />
              {n.total > 0 && (
                <span className="absolute -right-0.5 -bottom-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-surface-raised ring-1 ring-white/10 text-[9px] leading-[14px] text-gray-400 tabular-nums">
                  {n.total}
                </span>
              )}
            </button>
          ))}
          {tree.hosts.map((h) => (
            <button
              key={`${h.kind}:${h.id}`}
              className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/[0.05]"
              title={`${h.name}\n${h.detail}`}
              onClick={() => props.actions.openHost(h)}
              onContextMenu={(e) => props.actions.hostMenu(e, h)}
            >
              <Avatar label={h.name} colorKey={h.id} live={props.connectedIds.has(h.id)} icon={hostIcon(h, 13)} size={30} />
            </button>
          ))}
        </div>
        {flyout && tree.byId.get(flyout.id) && (
          <Flyout top={flyout.top} node={tree.byId.get(flyout.id)!} onClose={() => setFlyout(null)}>
            <HostTree
              tree={tree}
              rootId={flyout.id}
              connected={props.connectedIds}
              collapsed={collapsed}
              onToggle={toggle}
              renamingId={props.renamingId}
              onRenameDone={props.onRenameDone}
              actions={{
                ...props.actions,
                openHost: (h) => {
                  setFlyout(null);
                  props.actions.openHost(h);
                },
              }}
            />
          </Flyout>
        )}
      </aside>
    );
  }

  return (
    <aside className="relative flex-shrink-0 flex flex-col bg-app pb-2" style={{ width }}>
      {handle}
      <div className="flex items-center gap-1 px-3 pt-1 pb-3">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          <input
            ref={searchRef}
            className="w-full h-8 pl-8 pr-7 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[12.5px] text-gray-200 placeholder-gray-500 focus:outline-none focus:border-accent/60 focus:bg-white/[0.06] transition-colors"
            placeholder="Filter hosts, #tag"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery('');
              if (e.key === 'Enter' && results[0]) props.actions.openHost(results[0]);
            }}
          />
          {query && (
            <button className="absolute right-1 top-1/2 -translate-y-1/2 icon-btn w-6 h-6" onClick={() => setQuery('')}>
              <X size={12} />
            </button>
          )}
        </div>
        <button className="icon-btn w-8 h-8" onClick={props.onNewFolder} title="New folder">
          <FolderPlus size={15} />
        </button>
        <button className="icon-btn w-8 h-8" onClick={props.onNewHost} title="New host">
          <Plus size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2" onContextMenu={props.onBackgroundMenu}>
        {selection.length > 1 && (
          <div className="mb-1.5 mx-1 flex items-center gap-1 px-2 h-8 rounded-lg bg-accent/10 ring-1 ring-inset ring-accent/30 text-2xs text-gray-300">
            <span className="flex-1">{selection.length} selected</span>
            <button className="px-2 h-6 rounded-md hover:bg-white/[0.08] text-accent" onClick={(e) => props.actions.selectionMenu(e, selection)}>
              Actions
            </button>
            <button className="icon-btn w-6 h-6" onClick={clearSelection} title="Clear selection (Esc)">
              <X size={12} />
            </button>
          </div>
        )}
        {q ? (
          <SearchResults
            tree={tree}
            results={results}
            connected={props.connectedIds}
            actions={props.actions}
            selection={selection}
            onSelectClick={(h, e) => selectClick(h, e, results)}
            onClearSelection={clearSelection}
            reach={reach}
          />
        ) : hosts.length === 0 && folders.length === 0 ? (
          <button
            className="w-full text-left px-3 py-3 rounded-lg border border-dashed border-white/10 text-2xs text-gray-500 hover:text-gray-300 hover:border-white/20 transition-colors"
            onClick={props.onNewHost}
          >
            No saved hosts yet. <span className="text-accent">Add one</span> or right-click to import from another app.
          </button>
        ) : (
          <HostTree
            tree={tree}
            connected={props.connectedIds}
            collapsed={collapsed}
            onToggle={toggle}
            renamingId={props.renamingId}
            onRenameDone={props.onRenameDone}
            actions={props.actions}
            sections={sections}
            selection={selection}
            onSelectClick={(h, e) => selectClick(h, e)}
            onClearSelection={clearSelection}
            reach={reach}
          />
        )}
      </div>
    </aside>
  );
}

function SearchResults({
  tree,
  results,
  connected,
  actions,
  selection,
  onSelectClick,
  onClearSelection,
  reach,
}: {
  tree: Tree;
  results: HostItem[];
  connected: Set<string>;
  actions: TreeActions;
  selection: HostItem[];
  onSelectClick: (h: HostItem, e: React.MouseEvent) => void;
  onClearSelection: () => void;
  reach: Map<string, boolean>;
}) {
  const selected = new Set(selection.map((h) => `${h.kind}:${h.id}`));
  if (results.length === 0) return <p className="px-3 py-2 text-2xs text-gray-600">No matches</p>;
  return (
    <div className="space-y-px">
      {results.map((h) => {
        const path = folderPath(tree, h.folderId);
        return (
          <button
            key={`${h.kind}:${h.id}`}
            className={`w-full flex items-center gap-2.5 px-2 py-1 rounded-lg text-left ${
              selected.has(`${h.kind}:${h.id}`) ? 'bg-accent/15 ring-1 ring-inset ring-accent/40' : 'hover:bg-white/[0.05]'
            }`}
            title={hostTooltip(h)}
            onClick={(e) => {
              if (e.ctrlKey || e.metaKey || e.shiftKey) return onSelectClick(h, e);
              onClearSelection();
              actions.openHost(h);
            }}
            onContextMenu={(e) =>
              selected.has(`${h.kind}:${h.id}`) && selection.length > 1 ? actions.selectionMenu(e, selection) : actions.hostMenu(e, h)
            }
          >
            <Avatar label={h.name} colorKey={h.id} live={connected.has(h.id)} icon={hostIcon(h, 12)} size={26} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="text-[12.5px] font-medium text-gray-200 truncate">{h.name}</span>
                <ProtoBadge host={h} />
                {h.meta.favorite && <Star size={10} className="flex-shrink-0 text-amber-300 fill-amber-300" />}
                <ReachDot up={reach.get(`${h.kind}:${h.id}`)} />
              </span>
              <span className="block text-2xs text-gray-500 truncate">
                {path.length > 0 && <span className="text-gray-600">{path.join(' / ')} · </span>}
                {hostSubtitle(h)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Flyout({ top, node, onClose, children }: { top: number; node: FolderNode; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('.z-\\[80\\]')) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', onDown, true); // capture: some areas stop mousedown from bubbling
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="fixed z-50 w-64 max-h-[70vh] flex flex-col rounded-xl bg-surface-raised/95 backdrop-blur-xl shadow-pop animate-pop-in"
      style={{ left: RAIL_WIDTH + 6, top: Math.max(48, Math.min(top - 8, window.innerHeight - 320)) }}
    >
      <div className="flex items-center gap-2 px-3 h-9 border-b border-white/[0.06]">
        <FolderIcon size={14} style={{ color: node.folder.color || 'rgb(161 161 170)' }} />
        <span className="flex-1 truncate text-[12.5px] font-semibold text-gray-200">{node.folder.name}</span>
        <span className="text-2xs text-gray-500">{node.total}</span>
      </div>
      <div className="overflow-y-auto p-1.5">{children}</div>
    </div>
  );
}
