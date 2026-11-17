import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Select } from '../ui/Select';
import type { SavedTunnel, SSHProfile } from '../../types';
import { ListSSHProfiles } from '../../../wailsjs/go/main/App';

const KINDS = [
  { value: 'local', label: 'Local (-L)' },
  { value: 'remote', label: 'Remote (-R)' },
  { value: 'dynamic', label: 'SOCKS (-D)' },
];

export function describeTunnel(t: Pick<SavedTunnel, 'kind' | 'bindHost' | 'bindPort' | 'destHost' | 'destPort'>): string {
  const bind = `${t.bindHost || (t.kind === 'remote' ? 'localhost' : '127.0.0.1')}:${t.bindPort || 'auto'}`;
  if (t.kind === 'dynamic') return `SOCKS5 on ${bind}`;
  return t.kind === 'remote' ? `server ${bind} → ${t.destHost}:${t.destPort}` : `${bind} → ${t.destHost}:${t.destPort}`;
}

/** Jump host picker (ProxyJump). Fetches saved SSH hosts itself. */
export function JumpHostSelect({ value, selfId, onChange }: { value: string; selfId?: string; onChange: (id: string) => void }) {
  const [hosts, setHosts] = useState<SSHProfile[]>([]);
  useEffect(() => {
    ListSSHProfiles()
      .then((l) => setHosts((l ?? []) as SSHProfile[]))
      .catch(() => setHosts([]));
  }, []);
  const options = [
    { value: '', label: 'None (direct connection)' },
    ...hosts.filter((h) => h.id !== selfId).map((h) => ({ value: h.id, label: `${h.name} (${h.username}@${h.host})` })),
  ];
  return <Select value={value} options={options} onChange={onChange} />;
}

export function TunnelEditor({ tunnels, onChange }: { tunnels: SavedTunnel[]; onChange: (t: SavedTunnel[]) => void }) {
  const update = (id: string, patch: Partial<SavedTunnel>) => onChange(tunnels.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const add = () =>
    onChange([...tunnels, { id: crypto.randomUUID(), kind: 'local', bindHost: '', bindPort: 8080, destHost: 'localhost', destPort: 80, autoStart: false }]);

  return (
    <div className="space-y-2">
      {tunnels.map((t) => (
        <div key={t.id} className="rounded-lg bg-white/[0.03] p-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <Select className="w-32" value={t.kind} options={KINDS} onChange={(kind) => update(t.id, { kind })} />
            <label className="flex items-center gap-1.5 text-2xs text-gray-400 cursor-pointer select-none">
              <input type="checkbox" checked={t.autoStart} onChange={(e) => update(t.id, { autoStart: e.target.checked })} />
              Start with host
            </label>
            <button type="button" className="ml-auto text-gray-500 hover:text-gray-200" aria-label="Remove tunnel" onClick={() => onChange(tunnels.filter((x) => x.id !== t.id))}>
              <X size={13} />
            </button>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-2xs">
            <input
              className="input-field h-7 w-[84px]"
              placeholder={t.kind === 'remote' ? 'localhost' : '127.0.0.1'}
              value={t.bindHost}
              onChange={(e) => update(t.id, { bindHost: e.target.value })}
              aria-label="Bind address"
              spellCheck={false}
            />
            <input
              className="input-field h-7 w-[64px]"
              type="number"
              min={t.kind === 'remote' ? 1 : 0}
              max={65535}
              placeholder="auto"
              value={t.bindPort || ''}
              onChange={(e) => update(t.id, { bindPort: Number(e.target.value) || 0 })}
              aria-label="Listen port"
            />
            {t.kind !== 'dynamic' && (
              <>
                <span className="text-gray-600">→</span>
                <input className="input-field h-7 flex-1 min-w-0" value={t.destHost} onChange={(e) => update(t.id, { destHost: e.target.value })} aria-label="Destination host" spellCheck={false} />
                <input
                  className="input-field h-7 w-[64px]"
                  type="number"
                  min={1}
                  max={65535}
                  value={t.destPort || ''}
                  onChange={(e) => update(t.id, { destPort: Number(e.target.value) || 0 })}
                  aria-label="Destination port"
                />
              </>
            )}
          </div>
        </div>
      ))}
      <button type="button" className="btn-ghost h-7 px-2.5 text-2xs inline-flex items-center gap-1" onClick={add}>
        <Plus size={12} /> Add tunnel
      </button>
    </div>
  );
}
