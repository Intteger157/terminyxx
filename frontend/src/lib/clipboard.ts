import { ClipboardWrite } from '../../wailsjs/go/main/App';
import { ClipboardGetText } from '../../wailsjs/runtime/runtime';

/**
 * All copies from the app go through here so the backend can schedule the
 * auto-clear (Settings → Security → Clipboard). The backend decides whether
 * the text is sensitive; `sensitive` forces it (passwords, fingerprints…).
 */
type Notifier = (seconds: number) => void;
let notify: Notifier | null = null;

/** App registers a toast for "clipboard will be cleared in N s". */
export function setClipboardNotifier(fn: Notifier | null): void {
  notify = fn;
}

export async function copyText(text: string, sensitive = false): Promise<void> {
  try {
    const seconds = await ClipboardWrite(text, sensitive);
    if (seconds > 0) notify?.(seconds);
  } catch {
    // Backend clipboard failed (or no backend in a plain browser): no auto-clear then.
    await navigator.clipboard?.writeText(text).catch(() => {});
  }
}

export async function readClipboard(): Promise<string> {
  try {
    const text = await ClipboardGetText();
    if (text) return text;
  } catch {
    // fall through
  }
  try {
    return (await navigator.clipboard?.readText()) ?? '';
  } catch {
    return '';
  }
}
