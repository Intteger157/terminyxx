import type { ClipboardProvider } from '@devolutions/iron-remote-desktop';
import { RDPClipboardChanged, RDPClipboardWrite } from '../../wailsjs/go/main/App';

/**
 * The built-in RDP client's clipboard on macOS. WKWebView shows a "Paste" menu
 * on every navigator.clipboard.read(), so the component can't watch the
 * clipboard there: Go reads and writes NSPasteboard instead
 * (internal/pasteboard). Text, HTML and PNG images go both ways.
 * Elsewhere the component's own clipboard code works and this returns null.
 */
export function nativeClipboard(): ClipboardProvider | null {
  if (!navigator.platform.toLowerCase().includes('mac')) return null;
  return {
    async read() {
      const c = await RDPClipboardChanged();
      if (!c) return null;
      const items: Record<string, string | Uint8Array> = {};
      if (c.text) items['text/plain'] = c.text;
      if (c.html) items['text/html'] = c.html;
      if (c.png) items['image/png'] = fromBase64(c.png);
      return items;
    },
    async write(items) {
      const text = items['text/plain'];
      const html = items['text/html'];
      const png = items['image/png'];
      await RDPClipboardWrite({
        text: typeof text === 'string' ? text : undefined,
        html: typeof html === 'string' ? html : undefined,
        png: png instanceof Uint8Array ? toBase64(png) : undefined,
      });
    },
  };
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toBase64(b: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(bin);
}
