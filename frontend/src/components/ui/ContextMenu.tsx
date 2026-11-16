import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type MenuEntry =
  | { type?: 'item'; label: string; icon?: ReactNode; danger?: boolean; disabled?: boolean; hint?: string; onSelect: () => void }
  | { type: 'separator' }
  | { type: 'custom'; render: (close: () => void) => ReactNode };

interface MenuState {
  x: number;
  y: number;
  entries: MenuEntry[];
}

const MenuContext = createContext<(e: React.MouseEvent | MouseEvent, entries: MenuEntry[]) => void>(() => {});

/** Returns a function that opens a context menu at the mouse position. */
export function useContextMenu() {
  return useContext(MenuContext);
}

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const open = useCallback((e: React.MouseEvent | MouseEvent, entries: MenuEntry[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, entries });
  }, []);
  return (
    <MenuContext.Provider value={open}>
      {children}
      {menu && <Menu state={menu} onClose={() => setMenu(null)} />}
    </MenuContext.Provider>
  );
}

function Menu({ state, onClose }: { state: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: state.x, y: state.y });
  const [cursor, setCursor] = useState(-1);
  const items = state.entries;

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.min(state.x, window.innerWidth - r.width - 6),
      y: Math.min(state.y, window.innerHeight - r.height - 6),
    });
  }, [state.x, state.y]);

  useEffect(() => {
    ref.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onBlur = () => onClose();
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onBlur);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onBlur);
    };
  }, [onClose]);

  const selectable = items.map((it, i) => (it.type === 'separator' || it.type === 'custom' || it.disabled ? -1 : i)).filter((i) => i >= 0);

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = selectable.indexOf(cursor);
      const next = e.key === 'ArrowDown' ? selectable[(idx + 1) % selectable.length] : selectable[(idx - 1 + selectable.length) % selectable.length];
      setCursor(next ?? -1);
    }
    if (e.key === 'Enter' && cursor >= 0) {
      const it = items[cursor];
      if (it.type !== 'separator' && it.type !== 'custom') {
        onClose();
        it.onSelect();
      }
    }
  };

  return (
    <div
      ref={ref}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[80] min-w-[200px] p-1 rounded-xl bg-surface-raised/95 backdrop-blur-xl shadow-pop outline-none animate-pop-in"
      style={{ left: pos.x, top: pos.y }}
    >
      {items.map((it, i) => {
        if (it.type === 'separator') return <div key={i} className="my-1 h-px bg-white/[0.06]" />;
        if (it.type === 'custom') return <div key={i}>{it.render(onClose)}</div>;
        return (
          <button
            key={i}
            disabled={it.disabled}
            onMouseEnter={() => setCursor(i)}
            onClick={() => {
              onClose();
              it.onSelect();
            }}
            className={`w-full flex items-center gap-2.5 h-8 px-2.5 rounded-lg text-left text-[12.5px] transition-colors disabled:opacity-40 ${
              cursor === i ? (it.danger ? 'bg-red-500/15 text-red-300' : 'bg-white/[0.07] text-gray-100') : it.danger ? 'text-red-300/90' : 'text-gray-300'
            }`}
          >
            <span className="w-4 flex justify-center text-gray-500">{it.icon}</span>
            <span className="flex-1 truncate">{it.label}</span>
            {it.hint && <span className="text-2xs text-gray-600">{it.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}
