import type { SSHProfile } from '../types';

/** One jump host of an imported host, outermost first (mirrors importers.Hop). */
export interface ImportHop {
  /** Another host of the same import (its position in the list), or -1. */
  index: number;
  host: string;
  port: number;
  user: string;
}

export interface JumpPlanItem {
  /** Position in the import list. */
  index: number;
  id: string;
  /** The host's login, used for a new jump host whose hop names no user. */
  user: string;
  jump: ImportHop[];
}

/** A host the import must create because a hop matched nothing. */
export interface NewHop {
  id: string;
  host: string;
  port: number;
  user: string;
}

export interface JumpPlan {
  /** Jump host id for each imported host id (only those that have one). */
  jumpOf: Map<string, string>;
  created: NewHop[];
}

const same = (a: { host: string; port: number }, b: { host: string; port: number }) => a.host.toLowerCase() === b.host.toLowerCase() && a.port === b.port;

/**
 * Turns the imported jump chains into jumpProfileId links. A hop is, in order:
 * another host of this import that is being imported, an already saved host
 * with the same address (and user, if the hop names one), a host created
 * earlier in this import, or a new host. Only hosts this import writes get a
 * jump host set, and never one they already had, so saved hosts don't change.
 */
export function planJumps(items: JumpPlanItem[], saved: SSHProfile[], newId: () => string = () => crypto.randomUUID()): JumpPlan {
  const byIndex = new Map(items.map((it) => [it.index, it]));
  const jumpOf = new Map<string, string>();
  const created: NewHop[] = [];
  const ours = new Set(items.map((it) => it.id));

  const resolve = (hop: ImportHop, fallbackUser: string, via: string): string => {
    const it = hop.index >= 0 ? byIndex.get(hop.index) : undefined;
    if (it) return it.id;
    const userOk = (u: string) => !hop.user || u === hop.user;
    const ex = saved.find((p) => same(p, hop) && userOk(p.username));
    if (ex) return ex.id;
    // A host added by this import is shared only by chains that reach it the same way.
    const c = created.find((p) => same(p, hop) && userOk(p.user) && (jumpOf.get(p.id) ?? '') === via);
    if (c) return c.id;
    const n = { id: newId(), host: hop.host, port: hop.port, user: hop.user || fallbackUser };
    created.push(n);
    ours.add(n.id);
    return n.id;
  };

  for (const it of items) {
    if (it.jump.length === 0 || jumpOf.has(it.id)) continue;
    let prev = '';
    const seen = new Set([it.id]);
    for (const hop of it.jump) {
      const id = resolve(hop, it.user, prev);
      if (seen.has(id)) {
        prev = ''; // a loop: give up on this chain
        break;
      }
      seen.add(id);
      // An inner hop is reached through the previous one, unless it is a saved
      // host or already has its own way in.
      if (prev && ours.has(id) && !jumpOf.has(id) && !(byIndex.get(hop.index)?.jump.length)) jumpOf.set(id, prev);
      prev = id;
    }
    if (prev) jumpOf.set(it.id, prev);
  }
  return { jumpOf, created };
}
