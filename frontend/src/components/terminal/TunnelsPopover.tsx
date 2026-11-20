import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, Play, Square } from 'lucide-react';
import type { SavedTunnel, TerminalTab } from '../../types';
import { ListTunnels, StartTunnel, StopTunnel } from '../../../wailsjs/go/main/App';
import { connection } from '../../../wailsjs/go/models';
import { describeTunnel } from './TunnelEditor';

type Live = connection.TunnelInfo;

/** Status bar button + popover to see, start and stop port forwards. */
export function TunnelsPopover({ tab }: { tab: TerminalTab }) {
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState<Live[]>([]);
  const [error, setError] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const saved: SavedTunnel[] = tab.profile?.tunnels ?? [];

  const refresh = useCallback(() => {
    ListTunnels(tab.id)
      .then((l) => setLive(l ?? []))
      .catch(() => setLive([]));
  }, [tab.id]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, open ? 1500 : 5000);
    return () => clearInterval(t);
  }, [refresh, open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown, true); // capture: the title bar stops mousedown from bubbling
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [open]);

  const start = async (t: SavedTunnel) => {
    setError('');
    try {
      await StartTunnel(tab.id, connection.TunnelSpec.createFrom({ id: t.id, kind: t.kind, bindHost: t.bindHost, bindPort: t.bindPort, destHost: t.destHost, destPort: t.destPort }));
    } catch (e) {
      setError(String(e).replace(/^Error: /, ''));
    }
    refresh();
  };
  const stop = async (id: string) => {
    await StopTunnel(tab.id, id).catch(() => undefined);
    refresh();
  };

  const liveIds = new Set(live.map((l) => l.id));
  const idle = saved.filter((s) => !liveIds.has(s.id));
  if (live.length === 0 && saved.length === 0) return null;

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      <button
        className={`flex items-center gap-1 h-5 px-2 rounded-md transition-colors ${live.length ? 'bg-accent/15 text-accent' : 'hover:bg-white/[0.06] hover:text-gray-300'}`}
        onClick={() => setOpen((v) => !v)}
        title="Port forwarding"
        aria-expanded={open}
      >
        <ArrowRightLeft size={11} /> {live.length > 0 ? `${live.length} tunnel${live.length > 1 ? 's' : ''}` : 'Tunnels'}
      </button>
      {open && (
        <div className="absolute bottom-7 right-0 z-50 w-[360px] rounded-xl bg-raised p-2 shadow-xl ring-1 ring-white/[0.08] space-y-1">
          {live.map((l) => (
            <div key={l.id} className="flex items-center gap-2 rounded-lg px-2 h-8 hover:bg-white/[0.04]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
              <span className="flex-1 truncate font-mono text-2xs text-gray-300" title={describeTunnel({ ...l, bindHost: l.bindHost, bindPort: l.listenAddr ? Number(l.listenAddr.split(':').pop()) : l.bindPort })}>
                {describeTunnel({ ...l, bindPort: l.listenAddr ? Number(l.listenAddr.split(':').pop()) : l.bindPort })}
              </span>
              <span className="text-2xs text-gray-600 tabular-nums">{l.active} active</span>
              <button className="text-gray-500 hover:text-red-300" onClick={() => void stop(l.id)} aria-label="Stop tunnel">
                <Square size={11} />
              </button>
            </div>
          ))}
          {idle.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-lg px-2 h-8 hover:bg-white/[0.04]">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-600 flex-shrink-0" />
              <span className="flex-1 truncate font-mono text-2xs text-gray-500">{describeTunnel(s)}</span>
              <button className="text-gray-500 hover:text-emerald-300" onClick={() => void start(s)} aria-label="Start tunnel">
                <Play size={11} />
              </button>
            </div>
          ))}
          {error && <p className="px-2 text-2xs text-red-300">{error}</p>}
          <p className="px-2 pt-1 text-2xs text-gray-600">Edit tunnels in the host settings.</p>
        </div>
      )}
    </div>
  );
}
