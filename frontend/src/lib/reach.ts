import { useEffect, useRef, useState } from 'react';
import { PingHosts } from '../../wailsjs/go/main/App';
import type { HostItem } from '../components/sidebar/tree';
import { reachTarget } from '../components/sidebar/tree';
import { useAppLock } from './appLock';

/**
 * Availability of the hosts shown in the sidebar: a TCP connect to each
 * one's port every `seconds` (nothing is sent). Only visible hosts are
 * checked, only while the window is visible and the app is unlocked. The
 * result maps "kind:id" to up (true) or down (false).
 */
export function useReachability(hosts: HostItem[], enabled: boolean, seconds: number): Map<string, boolean> {
  const [state, setState] = useState<Map<string, boolean>>(new Map());
  const { locked } = useAppLock();
  const hostsRef = useRef(hosts);
  hostsRef.current = hosts;
  const known = useRef(new Map<string, boolean>());

  // Hosts checked by address: the same address shares one result.
  const targetKey = hosts
    .map((h) => {
      const t = reachTarget(h);
      return t ? `${h.kind}:${h.id}=${t.host}:${t.port}` : '';
    })
    .filter(Boolean)
    .sort()
    .join(',');

  useEffect(() => {
    if (!enabled || locked) {
      known.current = new Map();
      setState(new Map());
      return;
    }
    let cancelled = false;
    let busy = false;
    const probe = async (onlyNew: boolean) => {
      if (busy || document.visibilityState === 'hidden') return;
      const targets = hostsRef.current
        .map((h) => ({ key: `${h.kind}:${h.id}`, t: reachTarget(h) }))
        .filter((x) => x.t && (!onlyNew || !known.current.has(x.key)))
        .map((x) => ({ key: x.key, host: x.t!.host, port: x.t!.port }));
      if (targets.length === 0) return;
      busy = true;
      try {
        const res = await PingHosts(targets);
        if (cancelled) return;
        const next = new Map(known.current);
        for (const r of res ?? []) next.set(r.key, r.up);
        known.current = next;
        setState(next);
      } catch {
        // locked meanwhile, or the backend refused: keep the last state
      } finally {
        busy = false;
      }
    };
    // A changed set (folder opened, address edited) is checked again soon.
    const first = window.setTimeout(() => void probe(false), 400);
    const timer = window.setInterval(() => void probe(false), Math.max(15, seconds) * 1000);
    const onVisible = () => document.visibilityState === 'visible' && void probe(true);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, locked, seconds, targetKey]);

  return state;
}
