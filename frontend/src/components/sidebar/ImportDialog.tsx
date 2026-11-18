import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, FolderOpen, Loader2, Monitor, Route, Upload } from 'lucide-react';
import { Modal, errorText } from '../ui/Dialogs';
import { Toggle } from '../terminal/ConnectDialog';
import type { RDPProfile, SSHProfile } from '../../types';
import type { ImportHop } from '../../lib/importJumps';
import { ListImportSources, PickImportPaths, ReadImport } from '../../../wailsjs/go/main/App';

export interface ImportItem {
  key: string;
  /** Position in the source's list (jump hops refer to it). */
  index: number;
  /** Jump hosts, outermost first. */
  jump: ImportHop[];
  name: string;
  folder: string[];
  kind: 'ssh' | 'rdp';
  host: string;
  port: number;
  user: string;
  keyFile: string;
  /** OpenSSH ProxyCommand, run locally to reach the host. */
  proxyCommand?: string;
  x11?: boolean;
  warning: string;
  domain: string;
  width: number;
  height: number;
  fullscreen: boolean;
}

interface SourceInfo {
  id: string;
  name: string;
  detected: string;
  pick: string;
  hint: string;
}

interface Loaded {
  path: string;
  items: ImportItem[];
  notes: string[];
  skipped: Record<string, number>;
}

interface ImportDialogProps {
  existingSSH: SSHProfile[];
  existingRDP: RDPProfile[];
  onClose: () => void;
  onImport: (items: ImportItem[], rootFolder: string, keepFolders: boolean) => Promise<void>;
}

/** "bastion → inner" for the hops of it. */
const hopNames = (it: ImportItem, all: ImportItem[]) =>
  it.jump.map((h) => all.find((x) => x.index === h.index)?.name ?? (h.user ? `${h.user}@${h.host}` : h.host) + (h.port !== 22 ? `:${h.port}` : '')).join(' → ');

const pickLabel = (pick: string) => (pick === 'folder' ? 'Choose folder…' : pick === 'files' ? 'Choose files…' : 'Choose file…');

export function ImportDialog({ existingSSH, existingRDP, onClose, onImport }: ImportDialogProps) {
  const [sources, setSources] = useState<SourceInfo[] | null>(null);
  const [sourceId, setSourceId] = useState<string>('');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [root, setRoot] = useState('');
  const [keepFolders, setKeepFolders] = useState(true);
  const [busy, setBusy] = useState(false);

  const source = sources?.find((s) => s.id === sourceId);

  const isDuplicate = useMemo(() => {
    const keys = new Set([
      ...existingSSH.map((p) => `ssh:${p.username}@${p.host}:${p.port}`),
      ...existingRDP.map((p) => `rdp:${p.username}@${p.host}:${p.port}`),
    ]);
    return (it: ImportItem) => keys.has(`${it.kind}:${it.user}@${it.host}:${it.port}`);
  }, [existingSSH, existingRDP]);

  const load = useCallback(
    async (id: string, paths: string[]) => {
      setLoading(true);
      setError(null);
      try {
        const res = await ReadImport(id, paths);
        const items: ImportItem[] = (res.hosts ?? []).map((h, i) => ({ ...h, key: `${i}:${h.name}`, index: i, jump: h.jump ?? [], folder: h.folder ?? [], kind: h.kind === 'rdp' ? 'rdp' : 'ssh' }));
        setLoaded({ path: res.path, items, notes: res.notes ?? [], skipped: res.skipped ?? {} });
        setSelected(new Set(items.filter((it) => !isDuplicate(it)).map((it) => it.key)));
      } catch (err) {
        setLoaded(null);
        setError(errorText(err));
      } finally {
        setLoading(false);
      }
    },
    [isDuplicate]
  );

  useEffect(() => {
    ListImportSources().then((list) => {
      setSources(list);
      const first = list.find((s) => s.detected) ?? list[0];
      if (first) selectSource(first);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectSource = (s: SourceInfo) => {
    setSourceId(s.id);
    setRoot(s.name.replace(/\s*\(.*\)$/, ''));
    setLoaded(null);
    setSelected(new Set());
    setError(null);
    if (s.detected) load(s.id, []);
  };

  const pick = async () => {
    if (!source) return;
    try {
      const paths = await PickImportPaths(source.id);
      if (paths && paths.length > 0) load(source.id, paths);
    } catch (err) {
      setError(errorText(err));
    }
  };

  const toggle = (key: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const items = loaded?.items ?? [];
  const hasFolders = items.some((it) => it.folder.length > 0);
  const skipped = Object.entries(loaded?.skipped ?? {}).map(([t, n]) => `${n} ${t}`);

  const submit = async () => {
    setBusy(true);
    try {
      await onImport(items.filter((it) => selected.has(it.key)), root.trim(), keepFolders && hasFolders);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Import hosts"
      subtitle="Bring your saved hosts over from another app."
      icon={
        <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-accent/10 text-accent ring-1 ring-inset ring-accent/25">
          <Upload size={16} />
        </span>
      }
      onClose={onClose}
      width="max-w-4xl"
    >
      <div className="grid grid-cols-[220px_1fr] gap-4 px-5 pb-5 min-h-[420px]">
        {/* sources */}
        <div className="flex flex-col gap-0.5 border-r border-white/[0.05] pr-3">
          {!sources && (
            <p className="flex items-center gap-2 text-gray-500 py-2">
              <Loader2 size={14} className="animate-spin" /> Looking for apps…
            </p>
          )}
          {sources?.map((s) => (
            <button
              key={s.id}
              onClick={() => selectSource(s)}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                s.id === sourceId ? 'bg-accent/[0.14] text-gray-100' : 'text-gray-300 hover:bg-white/[0.04]'
              }`}
            >
              <span className="flex-1 min-w-0">
                <span className="block text-[12.5px] font-medium truncate">{s.name}</span>
                <span className={`block text-2xs truncate ${s.detected ? 'text-emerald-400/90' : 'text-gray-600'}`}>
                  {s.detected ? 'Found on this computer' : s.pick === 'folder' ? 'Import from a folder' : s.pick ? 'Import from a file' : 'Not found'}
                </span>
              </span>
              {s.detected && <CheckCircle2 size={13} className="text-emerald-400/80 flex-shrink-0" />}
            </button>
          ))}
        </div>

        {/* preview */}
        <div className="flex flex-col min-w-0 gap-3">
          {source && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex-1 min-w-0 text-2xs text-gray-500 font-mono truncate" title={loaded?.path || source.detected}>
                {loaded?.path || source.detected || ''}
              </span>
              {source.pick && (
                <button className="btn-secondary h-8 flex-shrink-0" onClick={pick}>
                  {source.pick === 'folder' ? <FolderOpen size={13} /> : <FileUp size={13} />} {pickLabel(source.pick)}
                </button>
              )}
            </div>
          )}

          {error && <p className="px-3 py-2 rounded-lg bg-red-500/10 text-2xs text-red-300 break-words">{error}</p>}
          {loading && (
            <p className="flex items-center gap-2 text-gray-500">
              <Loader2 size={14} className="animate-spin" /> Reading…
            </p>
          )}

          {source && !loading && !loaded && !error && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 rounded-xl border border-dashed border-white/10 text-center">
              <p className="text-gray-400">{source.detected ? 'Reading…' : `${source.name} wasn’t found on this computer.`}</p>
              <p className="text-2xs text-gray-600 max-w-sm">{source.hint}</p>
              {source.pick && (
                <button className="btn-primary" onClick={pick}>
                  {pickLabel(source.pick)}
                </button>
              )}
            </div>
          )}

          {loaded && items.length === 0 && !loading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/10 text-gray-500">
              <p>No SSH or RDP hosts found.</p>
              {skipped.length > 0 && <p className="text-2xs text-gray-600">Skipped: {skipped.join(', ')}</p>}
            </div>
          )}

          {items.length > 0 && !loading && (
            <>
              <div className="flex items-center justify-between text-2xs text-gray-500">
                <span>
                  {selected.size} of {items.length} selected
                </span>
                <span className="flex gap-3">
                  <button className="hover:text-gray-200" onClick={() => setSelected(new Set(items.map((it) => it.key)))}>
                    Select all
                  </button>
                  <button className="hover:text-gray-200" onClick={() => setSelected(new Set())}>
                    None
                  </button>
                </span>
              </div>
              <div className="flex-1 min-h-0 max-h-[38vh] overflow-y-auto rounded-xl border border-white/[0.06] divide-y divide-white/[0.04]">
                {items.map((it) => (
                  <label key={it.key} className="flex items-center gap-3 px-3 py-2 hover:bg-white/[0.03] cursor-pointer">
                    <input type="checkbox" className="accent-[rgb(var(--accent))]" checked={selected.has(it.key)} onChange={() => toggle(it.key)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 min-w-0">
                        {it.kind === 'rdp' && <Monitor size={12} className="text-gray-500 flex-shrink-0" />}
                        <span className="font-medium text-gray-200 truncate">{it.name}</span>
                        {it.folder.length > 0 && (
                          <span className="text-2xs px-1.5 rounded bg-white/[0.05] text-gray-500 truncate max-w-[40%]">{it.folder.join(' / ')}</span>
                        )}
                        {isDuplicate(it) && <span className="text-2xs px-1.5 rounded bg-white/[0.06] text-gray-400 flex-shrink-0">already saved</span>}
                        {it.jump.length > 0 && (
                          <span
                            className="flex items-center gap-1 text-2xs px-1.5 rounded bg-white/[0.06] text-gray-400 flex-shrink-0 max-w-[40%] truncate"
                            title={`Connects through ${hopNames(it, items)}. Jump hosts that aren’t saved or imported yet are added as hosts.`}
                          >
                            <Route size={10} className="flex-shrink-0" /> via {hopNames(it, items)}
                          </span>
                        )}
                        {it.warning && (
                          <span className="flex items-center gap-1 text-2xs px-1.5 rounded bg-amber-400/10 text-amber-300 flex-shrink-0" title={it.warning}>
                            <AlertTriangle size={10} /> {it.warning}
                          </span>
                        )}
                      </span>
                      <span className="block text-2xs text-gray-500 font-mono truncate">
                        {it.domain ? `${it.domain}\\` : ''}
                        {it.user ? `${it.user}@` : ''}
                        {it.host}
                        {it.port !== (it.kind === 'rdp' ? 3389 : 22) && `:${it.port}`}
                        {it.keyFile && ` · ${it.keyFile.split(/[\\/]/).pop()}`}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {(skipped.length > 0 || loaded!.notes.length > 0) && (
                <div className="space-y-0.5 text-2xs text-gray-500">
                  {skipped.length > 0 && <p>Not imported (unsupported type): {skipped.join(', ')}.</p>}
                  {loaded!.notes.map((n) => (
                    <p key={n}>{n}</p>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-[1fr_auto] items-end gap-4">
                <div>
                  <label className="label">Put into folder</label>
                  <input className="input-field" value={root} onChange={(e) => setRoot(e.target.value)} placeholder="Leave empty for top level" />
                </div>
                {hasFolders && (
                  <div className="pb-2">
                    <Toggle checked={keepFolders} onChange={setKeepFolders} label="Keep folder structure" />
                  </div>
                )}
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 mt-auto pt-1">
            <button className="btn-ghost h-8 px-3" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" disabled={!loaded || selected.size === 0 || busy} onClick={submit}>
              {busy && <Loader2 size={13} className="animate-spin" />}
              Import {selected.size > 0 ? selected.size : ''}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
