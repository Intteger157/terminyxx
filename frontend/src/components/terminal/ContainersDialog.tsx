import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, SquareTerminal } from 'lucide-react';
import { Modal } from '../ui/Dialogs';
import type { TerminalTab } from '../../types';
import { ListContainers } from '../../../wailsjs/go/main/App';
import type { connection } from '../../../wailsjs/go/models';

const RUNTIMES = [
  { id: 'docker', label: 'Docker' },
  { id: 'podman', label: 'Podman' },
  { id: 'kubectl', label: 'Kubernetes' },
];

const KEY = 'terminyxx.runtime';

interface Props {
  tab: TerminalTab;
  onClose: () => void;
  /** Open a shell in the container in a new pane. */
  onOpen: (c: connection.Container) => void;
}

/** Lists containers or pods on the connected server; picking one opens a shell in it. */
export function ContainersDialog({ tab, onClose, onOpen }: Props) {
  const [runtime, setRuntime] = useState(() => {
    try {
      return localStorage.getItem(KEY) ?? 'docker';
    } catch {
      return 'docker';
    }
  });
  const [items, setItems] = useState<connection.Container[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError('');
    try {
      localStorage.setItem(KEY, runtime);
    } catch {
      // not remembered
    }
    ListContainers(tab.id, runtime)
      .then((l) => !cancelled && setItems(l ?? []))
      .catch((e) => !cancelled && setError(String(e).replace(/^Error: /, '')));
    return () => {
      cancelled = true;
    };
  }, [tab.id, runtime]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((c) => !q || `${c.name} ${c.image} ${c.namespace} ${c.status}`.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <Modal title="Containers" subtitle={`Open a shell inside a container on ${tab.title}.`} onClose={onClose} width="max-w-xl">
      <div className="px-5 pb-5 pt-1 space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 p-1 rounded-xl bg-black/20">
            {RUNTIMES.map((r) => (
              <button
                key={r.id}
                className={`h-7 px-2.5 text-[12px] rounded-lg transition-colors ${runtime === r.id ? 'bg-white/[0.09] text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}
                onClick={() => setRuntime(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
            <input className="input-field pl-8" placeholder="Filter" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          </div>
        </div>

        {items === null && !error && (
          <div className="py-8 flex justify-center text-gray-500">
            <Loader2 className="animate-spin" size={18} />
          </div>
        )}
        {error && <p className="py-6 text-center text-[12.5px] text-gray-400">{error}</p>}
        <div className="max-h-[50vh] overflow-y-auto space-y-0.5">
          {shown.map((c) => (
            <button key={`${c.namespace}/${c.id}`} className="w-full flex items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.05]" onClick={() => onOpen(c)}>
              <SquareTerminal size={14} className="text-accent flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] text-gray-200 truncate">
                  {c.namespace && <span className="text-gray-500">{c.namespace}/</span>}
                  {c.name}
                </div>
                <div className="text-2xs text-gray-500 truncate">{[c.image, c.status].filter(Boolean).join(' · ')}</div>
              </div>
            </button>
          ))}
          {items && items.length > 0 && shown.length === 0 && <p className="py-4 text-center text-[12.5px] text-gray-500">No match.</p>}
        </div>
        <p className="text-2xs text-gray-600">Opens a new pane with a second connection to the host and runs the exec command there. The user needs permission to use {runtime === 'kubectl' ? 'kubectl' : runtime}.</p>
      </div>
    </Modal>
  );
}
