import { OnFileDrop } from '../../wailsjs/runtime/runtime';

// Files dragged in from Explorer / Finder. Wails resolves their absolute paths
// natively and reports them with the drop coordinates; OnFileDrop can only be
// registered once, so this module dispatches to the element under the cursor.
//
// A drop zone is any element with data-file-drop="<id>"; a nested element
// with data-drop-dir="<path>" (a folder row) narrows the destination.

export type FileDropHandler = (paths: string[], dir: string | null) => void;

const handlers = new Map<string, FileDropHandler>();
let registered = false;

function dispatch(x: number, y: number, paths: string[]) {
  if (!paths?.length) return;
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  const zone = el?.closest<HTMLElement>('[data-file-drop]');
  if (!el || !zone) return;
  const handler = handlers.get(zone.dataset.fileDrop ?? '');
  if (!handler) return;
  const dirEl = el.closest<HTMLElement>('[data-drop-dir]');
  handler(paths, dirEl && zone.contains(dirEl) ? dirEl.dataset.dropDir ?? null : null);
}

export function onOsFileDrop(id: string, handler: FileDropHandler): () => void {
  if (!registered) {
    registered = true;
    try {
      OnFileDrop(dispatch, false);
    } catch {
      // no Wails runtime (plain browser dev server)
    }
  }
  handlers.set(id, handler);
  return () => {
    if (handlers.get(id) === handler) handlers.delete(id);
  };
}

/** True when the drag carries files from the OS rather than an in-app drag. */
export const isOsFileDrag = (dt: DataTransfer | null) => !!dt && Array.from(dt.types).includes('Files');
