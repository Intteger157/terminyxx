// Split layout for terminal tabs. A tab in the title bar is a TabGroup; its
// root is a tree of splits whose leaves are terminal sessions (pane ids are
// the session/connection ids). Sizes are fractions that sum to 1.

export type SplitDir = 'row' | 'column';
export type Side = 'left' | 'right' | 'top' | 'bottom';

export type LayoutNode =
  | { kind: 'pane'; id: string }
  | { kind: 'split'; id: string; dir: SplitDir; children: LayoutNode[]; sizes: number[] };

export interface TabGroup {
  id: string;
  root: LayoutNode;
  /** The pane that had focus last in this group. */
  focus: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Divider {
  splitId: string;
  index: number; // between children[index] and children[index + 1]
  dir: SplitDir;
  /** The split's own rect, used to convert mouse positions while dragging. */
  parent: Rect;
  /** Position of the boundary within the card (fraction). */
  at: number;
  /** Extent of the divider along the other axis. */
  span: Rect;
}

export function paneIds(n: LayoutNode): string[] {
  return n.kind === 'pane' ? [n.id] : n.children.flatMap(paneIds);
}

export function contains(n: LayoutNode, id: string): boolean {
  return n.kind === 'pane' ? n.id === id : n.children.some((c) => contains(c, id));
}

const axisOf = (side: Side): SplitDir => (side === 'left' || side === 'right' ? 'row' : 'column');
const before = (side: Side) => side === 'left' || side === 'top';

/** Puts `newId` next to the pane `target`. */
export function insertPane(root: LayoutNode, target: string, newId: string, side: Side): LayoutNode {
  const dir = axisOf(side);
  const leaf: LayoutNode = { kind: 'pane', id: newId };
  const walk = (n: LayoutNode): LayoutNode => {
    if (n.kind === 'pane') {
      if (n.id !== target) return n;
      return { kind: 'split', id: crypto.randomUUID(), dir, children: before(side) ? [leaf, n] : [n, leaf], sizes: [0.5, 0.5] };
    }
    const i = n.children.findIndex((c) => c.kind === 'pane' && c.id === target);
    if (i >= 0 && n.dir === dir) {
      // Same axis: become a sibling and share the target's space.
      const children = [...n.children];
      const sizes = [...n.sizes];
      const half = sizes[i] / 2;
      const at = before(side) ? i : i + 1;
      sizes[i] = half;
      children.splice(at, 0, leaf);
      sizes.splice(at, 0, half);
      return { ...n, children, sizes };
    }
    return { ...n, children: n.children.map(walk) };
  };
  return walk(root);
}

/** Removes a pane; returns null when nothing is left. */
export function removePane(root: LayoutNode, id: string): LayoutNode | null {
  if (root.kind === 'pane') return root.id === id ? null : root;
  const children: LayoutNode[] = [];
  const sizes: number[] = [];
  let freed = 0;
  root.children.forEach((c, i) => {
    const next = removePane(c, id);
    if (next) {
      children.push(next);
      sizes.push(root.sizes[i]);
    } else freed += root.sizes[i];
  });
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  const total = 1 - freed;
  const normalized = sizes.map((s) => s / total);
  // Flatten a child split that now runs along the same axis.
  const flatChildren: LayoutNode[] = [];
  const flatSizes: number[] = [];
  children.forEach((c, i) => {
    if (c.kind === 'split' && c.dir === root.dir) {
      c.children.forEach((cc, j) => {
        flatChildren.push(cc);
        flatSizes.push(c.sizes[j] * normalized[i]);
      });
    } else {
      flatChildren.push(c);
      flatSizes.push(normalized[i]);
    }
  });
  return { ...root, children: flatChildren, sizes: flatSizes };
}

export function setSizes(root: LayoutNode, splitId: string, sizes: number[]): LayoutNode {
  if (root.kind === 'pane') return root;
  if (root.id === splitId) return { ...root, sizes };
  return { ...root, children: root.children.map((c) => setSizes(c, splitId, sizes)) };
}

export function findSplit(root: LayoutNode, splitId: string): Extract<LayoutNode, { kind: 'split' }> | null {
  if (root.kind === 'pane') return null;
  if (root.id === splitId) return root;
  for (const c of root.children) {
    const f = findSplit(c, splitId);
    if (f) return f;
  }
  return null;
}

/** Pane and divider rectangles as fractions of the whole area. */
export function computeLayout(root: LayoutNode): { panes: Map<string, Rect>; dividers: Divider[] } {
  const panes = new Map<string, Rect>();
  const dividers: Divider[] = [];
  const walk = (n: LayoutNode, r: Rect) => {
    if (n.kind === 'pane') {
      panes.set(n.id, r);
      return;
    }
    let offset = 0;
    n.children.forEach((c, i) => {
      const s = n.sizes[i];
      const cr: Rect =
        n.dir === 'row' ? { x: r.x + offset * r.w, y: r.y, w: s * r.w, h: r.h } : { x: r.x, y: r.y + offset * r.h, w: r.w, h: s * r.h };
      walk(c, cr);
      offset += s;
      if (i < n.children.length - 1) {
        dividers.push({
          splitId: n.id,
          index: i,
          dir: n.dir,
          parent: r,
          at: n.dir === 'row' ? r.x + offset * r.w : r.y + offset * r.h,
          span: r,
        });
      }
    });
  };
  walk(root, { x: 0, y: 0, w: 1, h: 1 });
  return { panes, dividers };
}

/** The nearest pane in a direction, by rectangle geometry. */
export function neighbor(root: LayoutNode, from: string, side: Side): string | null {
  const { panes } = computeLayout(root);
  const a = panes.get(from);
  if (!a) return null;
  const eps = 1e-6;
  let best: { id: string; score: number } | null = null;
  for (const [id, b] of panes) {
    if (id === from) continue;
    let ok = false;
    let overlap = 0;
    let dist = 0;
    if (side === 'left' || side === 'right') {
      ok = side === 'left' ? b.x + b.w <= a.x + eps : b.x >= a.x + a.w - eps;
      overlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      dist = side === 'left' ? a.x - (b.x + b.w) : b.x - (a.x + a.w);
    } else {
      ok = side === 'top' ? b.y + b.h <= a.y + eps : b.y >= a.y + a.h - eps;
      overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      dist = side === 'top' ? a.y - (b.y + b.h) : b.y - (a.y + a.h);
    }
    if (!ok || overlap <= eps) continue;
    const score = dist * 10 - overlap;
    if (!best || score < best.score) best = { id, score };
  }
  return best?.id ?? null;
}

/** Which half of a pane a point (fractions within that pane) points at. */
export function sideAt(px: number, py: number): Side {
  const d = { left: px, right: 1 - px, top: py, bottom: 1 - py };
  return (Object.keys(d) as Side[]).reduce((a, b) => (d[b] < d[a] ? b : a));
}

export function halfRect(r: Rect, side: Side): Rect {
  switch (side) {
    case 'left':
      return { ...r, w: r.w / 2 };
    case 'right':
      return { ...r, x: r.x + r.w / 2, w: r.w / 2 };
    case 'top':
      return { ...r, h: r.h / 2 };
    default:
      return { ...r, y: r.y + r.h / 2, h: r.h / 2 };
  }
}

/** A grid of panes: rows of up to ceil(sqrt(n)) panes, as even as possible. */
export function gridLayout(ids: string[]): LayoutNode {
  if (ids.length === 1) return { kind: 'pane', id: ids[0] };
  const cols = Math.ceil(Math.sqrt(ids.length));
  const rows: LayoutNode[] = [];
  for (let i = 0; i < ids.length; i += cols) {
    const chunk = ids.slice(i, i + cols);
    rows.push(
      chunk.length === 1
        ? { kind: 'pane', id: chunk[0] }
        : { kind: 'split', id: crypto.randomUUID(), dir: 'row', children: chunk.map((id) => ({ kind: 'pane', id })), sizes: chunk.map(() => 1 / chunk.length) }
    );
  }
  if (rows.length === 1) return rows[0];
  return { kind: 'split', id: crypto.randomUUID(), dir: 'column', children: rows, sizes: rows.map(() => 1 / rows.length) };
}
