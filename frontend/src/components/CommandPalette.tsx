import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight, CornerDownLeft, Search } from 'lucide-react';
import { parseQuickTarget } from '../lib/hosts';
import type { QuickTarget } from '../lib/hosts';

export interface PaletteItem {
  id: string;
  group: 'Connect' | 'Hosts' | 'Tabs' | 'Actions';
  label: string;
  hint?: string;
  icon?: ReactNode;
  keywords?: string;
  shortcut?: string[];
  run: () => void;
}

interface CommandPaletteProps {
  items: PaletteItem[];
  onQuickConnect: (target: QuickTarget) => void;
  onClose: () => void;
}

const GROUP_ORDER: PaletteItem['group'][] = ['Connect', 'Hosts', 'Tabs', 'Actions'];

/** Subsequence match; lower score is better. */
function score(text: string, q: string): number | null {
  if (!q) return 0;
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx >= 0) return idx;
  let pos = -1;
  let gaps = 0;
  for (const ch of q) {
    const next = t.indexOf(ch, pos + 1);
    if (next < 0) return null;
    gaps += next - pos - 1;
    pos = next;
  }
  return 100 + gaps;
}

export function CommandPalette({ items, onQuickConnect, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list: PaletteItem[] = [];
    const target = parseQuickTarget(query);
    if (target) {
      list.push({
        id: 'quick',
        group: 'Connect',
        label: `Connect to ${target.username ? target.username + '@' : ''}${target.host}${target.port !== 22 ? ':' + target.port : ''}`,
        hint: 'SSH',
        icon: <ArrowRight size={14} />,
        run: () => onQuickConnect(target),
      });
    }
    const scored = items
      .map((it) => ({ it, s: score(`${it.label} ${it.hint ?? ''} ${it.keywords ?? ''}`, q) }))
      .filter((x) => x.s !== null)
      .sort((a, b) => GROUP_ORDER.indexOf(a.it.group) - GROUP_ORDER.indexOf(b.it.group) || (a.s as number) - (b.s as number));
    return [...list, ...scored.map((x) => x.it)];
  }, [items, query, onQuickConnect]);

  useEffect(() => setCursor(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const run = (item?: PaletteItem) => {
    if (!item) return;
    onClose();
    item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(results.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(results[cursor]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-[65] flex justify-center bg-black/40 backdrop-blur-[2px] animate-fade-in" onMouseDown={onClose}>
      <div
        className="mt-[12vh] w-full max-w-xl h-fit max-h-[60vh] flex flex-col rounded-2xl bg-surface-raised/95 backdrop-blur-xl shadow-pop overflow-hidden animate-pop-in"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 h-12 border-b border-white/[0.06]">
          <Search size={16} className="text-gray-500" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-[14px] text-gray-100 placeholder-gray-500 outline-none"
            placeholder="Search hosts and commands, or type user@host"
            value={query}
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <span className="kbd">Esc</span>
        </div>
        <div ref={listRef} className="overflow-y-auto p-1.5">
          {results.length === 0 && <p className="px-3 py-6 text-center text-gray-500">No results</p>}
          {results.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            const active = i === cursor;
            return (
              <div key={item.id}>
                {header && <div className="px-3 pt-2.5 pb-1 text-2xs font-semibold uppercase tracking-[0.08em] text-gray-600">{header}</div>}
                <button
                  data-idx={i}
                  className={`w-full flex items-center gap-3 px-3 h-9 rounded-lg text-left transition-colors ${
                    active ? 'bg-accent/[0.14] text-gray-100' : 'text-gray-300'
                  }`}
                  onMouseMove={() => setCursor(i)}
                  onClick={() => run(item)}
                >
                  <span className={`flex-shrink-0 ${active ? 'text-accent' : 'text-gray-500'}`}>{item.icon}</span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="text-2xs text-gray-500 truncate max-w-[40%] font-mono">{item.hint}</span>}
                  {item.shortcut && (
                    <span className="flex gap-0.5">
                      {item.shortcut.map((k) => (
                        <span key={k} className="kbd">
                          {k}
                        </span>
                      ))}
                    </span>
                  )}
                  {active && !item.shortcut && <CornerDownLeft size={13} className="text-gray-500" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
