import { useEffect } from 'react';

type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

export function useHotkeys(hotkeys: HotkeyMap, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');

      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        parts.push(key);
      }

      const combo = parts.join('+');
      const fnKey = e.key.startsWith('F') && e.key.length <= 3 ? e.key : null;

      if (fnKey && hotkeys[fnKey]) {
        e.preventDefault();
        hotkeys[fnKey](e);
        return;
      }

      if (hotkeys[combo]) {
        e.preventDefault();
        hotkeys[combo](e);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hotkeys, enabled]);
}
