import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  /** Indent level, e.g. for nested folders. */
  depth?: number;
  icon?: ReactNode;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Themed replacement for <select>: the native dropdown is drawn by the OS
 * (light on Windows) and can't be styled to match the app.
 */
export function Select({ value, options, onChange, placeholder, className = '' }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    setCursor(Math.max(0, options.findIndex((o) => o.value === value)));
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !listRef.current?.contains(t)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // The list lives in a portal (fixed position) so dialogs with scrolling
  // bodies don't clip it; it opens upward when there is no room below.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = rootRef.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom - 8;
      const above = r.top - 8;
      const want = Math.min(240, options.length * 32 + 8);
      if (below >= want || below >= above) setPos({ left: r.left, width: r.width, top: r.bottom + 4, maxHeight: Math.max(96, below) });
      else setPos({ left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4, maxHeight: Math.max(96, above) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor, open]);

  const choose = (i: number) => {
    const o = options[i];
    if (o) onChange(o.value);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // don't close the surrounding dialog
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(options.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(cursor);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        className={`input-field flex items-center gap-2 text-left ${open ? 'border-accent/70 ring-4 ring-accent/15' : ''}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {current?.icon}
        <span className={`flex-1 truncate ${current ? '' : 'text-gray-500'}`}>{current?.label ?? placeholder}</span>
        <ChevronDown size={14} className={`text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && pos && createPortal(
        <div
          ref={listRef}
          role="listbox"
          className="fixed z-[90] overflow-y-auto p-1 rounded-xl bg-surface-raised/95 backdrop-blur-xl shadow-pop animate-pop-in"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: Math.min(240, pos.maxHeight) }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {options.map((o, i) => {
            const selected = o.value === value;
            return (
              <button
                key={o.value || '__empty'}
                type="button"
                role="option"
                aria-selected={selected}
                data-idx={i}
                onMouseEnter={() => setCursor(i)}
                onClick={() => choose(i)}
                className={`w-full flex items-center gap-2 h-8 pr-2 rounded-lg text-left text-[12.5px] transition-colors ${
                  i === cursor ? 'bg-white/[0.07] text-gray-100' : 'text-gray-300'
                }`}
                style={{ paddingLeft: 10 + (o.depth ?? 0) * 14 }}
              >
                {o.icon}
                <span className="flex-1 truncate">{o.label}</span>
                {selected && <Check size={13} className="text-accent" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
