import { useRef, useState } from 'react';
import { hostTagColor } from '../../lib/hostOptions';
import type { ReactNode } from 'react';
import { Columns2, Rows2, X } from 'lucide-react';
import type { TerminalTab } from '../../types';
import { computeLayout, findSplit, halfRect, sideAt } from '../../lib/layout';
import type { Divider, Rect, Side, TabGroup } from '../../lib/layout';
import { setPaneDrag, usePaneDrag } from '../../lib/paneDrag';
import type { PaneDrag } from '../../lib/paneDrag';
import { hostColor } from '../../lib/hosts';
import { StatusDot } from '../layout/TitleBar';

interface SplitViewProps {
  tabs: TerminalTab[];
  groups: TabGroup[];
  activeTabId: string | null;
  empty: ReactNode;
  renderPane: (tab: TerminalTab, state: { visible: boolean; focused: boolean }) => ReactNode;
  onFocus: (id: string) => void;
  onResize: (groupId: string, splitId: string, sizes: number[]) => void;
  /** target null = the area is empty (open as a new tab). */
  onDrop: (drag: PaneDrag, target: string | null, side: Side) => void;
  onSplit: (id: string, side: Side) => void;
  onClose: (id: string) => void;
  paneMenu: (e: React.MouseEvent, id: string) => void;
}

const GAP = 3; // px between panes, on each side of a divider
const MIN_PANE = 120; // px

function rectStyle(r: Rect, inset = GAP): React.CSSProperties {
  const l = r.x > 0.0001 ? inset : 0;
  const t = r.y > 0.0001 ? inset : 0;
  const rr = r.x + r.w < 0.9999 ? inset : 0;
  const b = r.y + r.h < 0.9999 ? inset : 0;
  return {
    left: `calc(${r.x * 100}% + ${l}px)`,
    top: `calc(${r.y * 100}% + ${t}px)`,
    width: `calc(${r.w * 100}% - ${l + rr}px)`,
    height: `calc(${r.h * 100}% - ${t + b}px)`,
  };
}

export function SplitView(props: SplitViewProps) {
  const { tabs, groups, activeTabId } = props;
  const areaRef = useRef<HTMLDivElement>(null);
  const drag = usePaneDrag();
  const [hint, setHint] = useState<{ target: string | null; side: Side } | null>(null);
  const [resizing, setResizing] = useState<'row' | 'column' | null>(null);

  const activeGroup = groups.find((g) => activeTabId && paneIdsOf(g).includes(activeTabId)) ?? null;
  const layout = activeGroup ? computeLayout(activeGroup.root) : null;
  const split = !!layout && layout.panes.size > 1;
  const groupOf = new Map<string, TabGroup>();
  groups.forEach((g) => paneIdsOf(g).forEach((id) => groupOf.set(id, g)));

  const startResize = (e: React.MouseEvent, d: Divider) => {
    if (!activeGroup) return;
    e.preventDefault();
    const area = areaRef.current!.getBoundingClientRect();
    const node = findSplit(activeGroup.root, d.splitId);
    if (!node) return;
    const sizes0 = node.sizes;
    const row = d.dir === 'row';
    const parentStart = row ? d.parent.x : d.parent.y;
    const parentLen = row ? d.parent.w : d.parent.h;
    const parentPx = parentLen * (row ? area.width : area.height);
    const start = sizes0.slice(0, d.index).reduce((a, b) => a + b, 0);
    const total = sizes0[d.index] + sizes0[d.index + 1];
    const min = Math.min(total / 2, MIN_PANE / parentPx);
    setResizing(d.dir);
    const move = (ev: MouseEvent) => {
      const pos = row ? (ev.clientX - area.left) / area.width : (ev.clientY - area.top) / area.height;
      const local = (pos - parentStart) / parentLen;
      const first = Math.min(total - min, Math.max(min, local - start));
      const sizes = [...sizes0];
      sizes[d.index] = first;
      sizes[d.index + 1] = total - first;
      props.onResize(activeGroup.id, d.splitId, sizes);
    };
    const up = () => {
      setResizing(null);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // Drop zones: the half of the pane under the cursor.
  const dropAllowed = (d: PaneDrag | null) => {
    if (!d) return false;
    if (d.kind === 'host') return true;
    // A lone pane can't be split with itself.
    return !(layout && layout.panes.size === 1 && layout.panes.has(d.id));
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!dropAllowed(drag)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const area = areaRef.current!.getBoundingClientRect();
    const fx = (e.clientX - area.left) / area.width;
    const fy = (e.clientY - area.top) / area.height;
    if (!layout) {
      setHint({ target: null, side: 'right' });
      return;
    }
    for (const [id, r] of layout.panes) {
      if (fx >= r.x && fx <= r.x + r.w && fy >= r.y && fy <= r.y + r.h) {
        if (drag?.kind === 'session' && drag.id === id) {
          setHint(null);
          return;
        }
        const side = sideAt((fx - r.x) / r.w, (fy - r.y) / r.h);
        if (!hint || hint.target !== id || hint.side !== side) setHint({ target: id, side });
        return;
      }
    }
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const d = drag;
    const h = hint;
    setHint(null);
    setPaneDrag(null);
    if (d && h) props.onDrop(d, h.target, h.side);
  };

  const hintRect: Rect | null = hint
    ? hint.target && layout?.panes.get(hint.target)
      ? halfRect(layout.panes.get(hint.target)!, hint.side)
      : { x: 0, y: 0, w: 1, h: 1 }
    : null;

  return (
    <div ref={areaRef} className="relative flex-1 min-h-0">
      {!activeGroup && props.empty}

      {tabs.map((tab) => {
        const g = groupOf.get(tab.id);
        const visible = !!g && g === activeGroup;
        const r = visible ? layout!.panes.get(tab.id) : undefined;
        const focused = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className={`card absolute flex flex-col overflow-hidden transition-shadow ${visible ? '' : 'hidden'} ${
              split && focused ? 'shadow-[0_0_0_1px_rgb(var(--accent)/0.45)]' : 'shadow-[0_1px_0_rgb(255_255_255/0.03)_inset]'
            }`}
            style={r ? rectStyle(r) : { inset: 0 }}
            onMouseDownCapture={() => !focused && props.onFocus(tab.id)}
            onFocusCapture={() => !focused && props.onFocus(tab.id)}
          >
            {hostTagColor(tab.profile) && (
              <div className="absolute top-0 inset-x-0 h-[2px] z-10 pointer-events-none" style={{ background: hostTagColor(tab.profile) }} aria-hidden />
            )}
            {split && (
              <PaneHeader
                tab={tab}
                focused={focused}
                onSplit={(side) => props.onSplit(tab.id, side)}
                onClose={() => props.onClose(tab.id)}
                onMenu={(e) => props.paneMenu(e, tab.id)}
              />
            )}
            <div className="relative flex-1 min-h-0">
              {props.renderPane(tab, { visible, focused })}
              {split && !focused && <div className="absolute inset-0 bg-black/20 pointer-events-none" />}
            </div>
          </div>
        );
      })}

      {split &&
        layout!.dividers.map((d) => {
          const row = d.dir === 'row';
          const style: React.CSSProperties = row
            ? { left: `calc(${d.at * 100}% - ${GAP + 1}px)`, width: GAP * 2 + 2, top: `${d.span.y * 100}%`, height: `${d.span.h * 100}%` }
            : { top: `calc(${d.at * 100}% - ${GAP + 1}px)`, height: GAP * 2 + 2, left: `${d.span.x * 100}%`, width: `${d.span.w * 100}%` };
          return (
            <div
              key={`${d.splitId}:${d.index}`}
              className={`absolute z-10 group ${row ? 'cursor-col-resize' : 'cursor-row-resize'}`}
              style={style}
              onMouseDown={(e) => startResize(e, d)}
              onDoubleClick={() => {
                const node = activeGroup && findSplit(activeGroup.root, d.splitId);
                if (node) props.onResize(activeGroup.id, d.splitId, node.sizes.map(() => 1 / node.sizes.length));
              }}
              title="Drag to resize · double-click to even out"
            >
              <div
                className={`absolute rounded-full bg-accent/0 group-hover:bg-accent/60 transition-colors ${
                  row ? 'inset-y-2 left-1/2 -translate-x-1/2 w-[2px]' : 'inset-x-2 top-1/2 -translate-y-1/2 h-[2px]'
                }`}
              />
            </div>
          );
        })}

      {resizing && <div className={`absolute inset-0 z-20 ${resizing === 'row' ? 'cursor-col-resize' : 'cursor-row-resize'}`} />}

      {dropAllowed(drag) && (
        <div className="absolute inset-0 z-30" onDragOver={onDragOver} onDragLeave={() => setHint(null)} onDrop={onDrop}>
          {hintRect && (
            <div
              className="absolute rounded-xl bg-accent/15 border-2 border-dashed border-accent/70 pointer-events-none transition-all duration-100 flex items-center justify-center"
              style={rectStyle(hintRect)}
            >
              <span className="px-2.5 py-1 rounded-lg bg-surface-raised/90 text-[12px] text-gray-200 shadow-pop">
                {hint?.target ? `Split ${hint.side}` : 'Open here'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function paneIdsOf(g: TabGroup): string[] {
  const out: string[] = [];
  const walk = (n: TabGroup['root']) => (n.kind === 'pane' ? out.push(n.id) : n.children.forEach(walk));
  walk(g.root);
  return out;
}

function PaneHeader({
  tab,
  focused,
  onSplit,
  onClose,
  onMenu,
}: {
  tab: TerminalTab;
  focused: boolean;
  onSplit: (side: Side) => void;
  onClose: () => void;
  onMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', tab.id);
        setPaneDrag({ kind: 'session', id: tab.id });
      }}
      onDragEnd={() => setPaneDrag(null)}
      onContextMenu={onMenu}
      className={`group flex items-center gap-2 h-7 pl-2.5 pr-1 flex-shrink-0 border-b select-none cursor-grab active:cursor-grabbing ${
        focused ? 'border-accent/25 bg-accent/[0.06] text-gray-200' : 'border-white/[0.05] text-gray-500'
      }`}
      title="Drag to move this pane"
    >
      <StatusDot status={tab.status} color={hostColor(tab.profile?.id ?? tab.host ?? tab.id)} />
      <span className="text-[12px] font-medium truncate">{tab.title}</span>
      {tab.profile && (
        <span className="text-2xs font-mono text-gray-600 truncate">
          {tab.profile.username}@{tab.profile.host}
        </span>
      )}
      <span className="flex-1" />
      <span className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="icon-btn w-6 h-6" onClick={() => onSplit('right')} title="Split right">
          <Columns2 size={12} />
        </button>
        <button className="icon-btn w-6 h-6" onClick={() => onSplit('bottom')} title="Split down">
          <Rows2 size={12} />
        </button>
      </span>
      <button className="icon-btn w-6 h-6" onClick={onClose} title="Close pane" aria-label="Close pane">
        <X size={12} />
      </button>
    </div>
  );
}
