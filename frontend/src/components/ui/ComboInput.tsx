import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { InputHTMLAttributes } from 'react';

export interface ComboOption {
  value: string;
  /** Shown next to the value, e.g. a key's name for its path. */
  label?: string;
}

interface ComboInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'list'> {
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  /** Show suggestions in the monospace font (paths). */
  mono?: boolean;
}

/**
 * Text input with themed suggestions: a replacement for <input list> +
 * <datalist>, whose popup the webview draws in the OS's light style.
 */
export function ComboInput({ value, onChange, options, mono, className = 'input-field', onKeyDown, onFocus, onBlur, ...rest }: ComboInputProps) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);

  // A value that is already one of the options shows them all, so the list
  // can be used to switch; otherwise it narrows to what was typed.
  const q = value.trim().toLowerCase();
  const exact = options.some((o) => o.value === value);
  const shown = !q || exact ? options : options.filter((o) => o.value.toLowerCase().includes(q) || o.label?.toLowerCase().includes(q));
  const visible = open && shown.length > 0;

  useEffect(() => setCursor(-1), [value, open]);

  useLayoutEffect(() => {
    if (!visible) return;
    const place = () => {
      const r = inputRef.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom - 8;
      const above = r.top - 8;
      const want = Math.min(240, shown.length * 32 + 8);
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
  }, [visible, shown.length]);

  useEffect(() => {
    if (visible && cursor >= 0) listRef.current?.querySelector(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor, visible]);

  const choose = (o: ComboOption) => {
    onChange(o.value);
    setOpen(false);
  };

  return (
    <>
      <input
        {...rest}
        ref={inputRef}
        className={className}
        value={value}
        role="combobox"
        aria-expanded={visible}
        aria-autocomplete="list"
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => {
          setOpen(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setOpen(false);
          onBlur?.(e);
        }}
        onMouseDown={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!visible) {
              setOpen(true);
              return;
            }
            const d = e.key === 'ArrowDown' ? 1 : -1;
            setCursor((c) => Math.max(0, Math.min(shown.length - 1, (c < 0 && d < 0 ? shown.length : c) + d)));
            return;
          }
          if (visible && e.key === 'Enter' && cursor >= 0 && shown[cursor]) {
            e.preventDefault();
            choose(shown[cursor]);
            return;
          }
          if (visible && e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation(); // don't close the surrounding dialog
            setOpen(false);
            return;
          }
          onKeyDown?.(e);
        }}
      />
      {visible && pos && createPortal(
        <div
          ref={listRef}
          role="listbox"
          className="fixed z-[90] overflow-y-auto p-1 rounded-xl bg-surface-raised/95 backdrop-blur-xl shadow-pop animate-pop-in"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: Math.min(240, pos.maxHeight) }}
          onMouseDown={(e) => e.preventDefault()} // keep focus in the input
        >
          {shown.map((o, i) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              data-idx={i}
              tabIndex={-1}
              onMouseEnter={() => setCursor(i)}
              onClick={() => choose(o)}
              className={`w-full flex items-center gap-2 h-8 px-2.5 rounded-lg text-left text-[12.5px] transition-colors ${
                i === cursor ? 'bg-white/[0.07] text-gray-100' : 'text-gray-300'
              }`}
            >
              <span className={`flex-1 truncate ${mono ? 'font-mono' : ''}`}>{o.value}</span>
              {o.label && o.label !== o.value && <span className="flex-shrink-0 max-w-[40%] truncate text-2xs text-gray-500">{o.label}</span>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
