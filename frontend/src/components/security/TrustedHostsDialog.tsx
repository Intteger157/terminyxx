import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, KeyRound, Loader2, Lock, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { ListTrustedHosts, RemoveTrustedHost } from '../../../wailsjs/go/main/App';
import { Modal, errorText, useDialogs } from '../ui/Dialogs';
import { copyText } from '../../lib/clipboard';

interface TrustedHost {
  id: string;
  hosts: string[] | null;
  hashed: boolean;
  keyType: string;
  fingerprint: string;
  marker: string;
  source: 'app' | 'openssh' | string;
}

/** Lists known_hosts entries and revokes the app's own ones. */
export function TrustedHostsDialog({ onClose }: { onClose: () => void }) {
  const dialogs = useDialogs();
  const [hosts, setHosts] = useState<TrustedHost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    ListTrustedHosts()
      .then((h) => setHosts(h ?? []))
      .catch((e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!hosts || !q) return hosts ?? [];
    return hosts.filter((h) => (h.hosts ?? []).some((x) => x.toLowerCase().includes(q)) || h.fingerprint.toLowerCase().includes(q) || h.keyType.includes(q));
  }, [hosts, query]);

  const revoke = async (h: TrustedHost) => {
    const name = hostLabel(h);
    const ok = await dialogs.confirm({
      title: 'Revoke trusted key?',
      danger: true,
      confirmLabel: 'Revoke',
      message: (
        <p>
          The {h.keyType} key of <span className="font-mono text-gray-100">{name}</span> will be forgotten. The next connection asks you to verify its fingerprint again.
        </p>
      ),
    });
    if (!ok) return;
    try {
      await RemoveTrustedHost(h.id);
      dialogs.toast(`Revoked the key of ${name}`, 'success');
      load();
    } catch (e) {
      dialogs.toast(errorText(e), 'error');
    }
  };

  const app = filtered.filter((h) => h.source === 'app');
  const openssh = filtered.filter((h) => h.source !== 'app');

  return (
    <Modal
      title="Trusted hosts"
      subtitle="Host keys you have verified. Terminyxx blocks a connection when a host's key no longer matches."
      icon={
        <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-accent/15 text-accent ring-1 ring-inset ring-accent/25">
          <ShieldCheck size={16} />
        </span>
      }
      onClose={onClose}
      width="max-w-2xl"
    >
      <div className="px-5 pb-5 space-y-4">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input className="input-field pl-8" placeholder="Filter by host or fingerprint" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus spellCheck={false} />
        </div>

        {error && <p className="text-[12.5px] text-red-400">{error}</p>}
        {!hosts && !error && (
          <div className="flex justify-center py-10 text-gray-500">
            <Loader2 size={18} className="animate-spin" />
          </div>
        )}

        {hosts && (
          <>
            <Group title="Trusted in Terminyxx" empty={query ? 'No matches.' : 'No hosts yet. Keys are added when you confirm a new host.'} items={app} onRevoke={revoke} />
            {openssh.length > 0 && (
              <Group
                title="From ~/.ssh/known_hosts"
                hint="Read-only: Terminyxx uses these keys but never edits OpenSSH's file. Remove them with ssh-keygen -R <host>."
                items={openssh}
              />
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function hostLabel(h: TrustedHost): string {
  const names = h.hosts ?? [];
  if (names.length) return names.join(', ');
  return h.hashed ? '(hashed host name)' : '(unknown)';
}

function Group({ title, hint, empty, items, onRevoke }: { title: string; hint?: string; empty?: string; items: TrustedHost[]; onRevoke?: (h: TrustedHost) => void }) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-1.5">
        <h3 className="text-[12.5px] font-semibold text-gray-300">{title}</h3>
        <span className="text-2xs text-gray-600 tabular-nums">{items.length}</span>
      </div>
      {hint && <p className="text-2xs text-gray-500 mb-2">{hint}</p>}
      {items.length === 0 ? (
        <p className="text-[12.5px] text-gray-500 py-3">{empty}</p>
      ) : (
        <div className="rounded-xl bg-white/[0.02] divide-y divide-white/[0.04] max-h-72 overflow-y-auto">
          {items.map((h) => (
            <div key={h.id + h.source} className="group flex items-center gap-3 px-3 py-2">
              <KeyRound size={14} className="flex-shrink-0 text-gray-500" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[12.5px] text-gray-200">
                  <span className="truncate font-mono">{hostLabel(h)}</span>
                  {h.marker && <span className="flex-shrink-0 rounded px-1 text-2xs bg-white/[0.06] text-gray-400">{h.marker}</span>}
                </div>
                <div className="flex items-center gap-2 text-2xs text-gray-500 font-mono">
                  <span className="flex-shrink-0">{h.keyType}</span>
                  <span className="truncate">{h.fingerprint}</span>
                </div>
              </div>
              <button className="icon-btn w-7 h-7 opacity-0 group-hover:opacity-100" title="Copy fingerprint" onClick={() => copyText(h.fingerprint)}>
                <Copy size={13} />
              </button>
              {onRevoke ? (
                <button className="icon-btn w-7 h-7 hover:text-red-300" title="Revoke" onClick={() => onRevoke(h)}>
                  <Trash2 size={13} />
                </button>
              ) : (
                <span className="w-7 h-7 flex items-center justify-center text-gray-600" title="Read-only">
                  <Lock size={12} />
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
