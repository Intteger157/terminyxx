import { useEffect, useState } from 'react';
import { ArrowLeft, FolderOpen, Search, Trash2 } from 'lucide-react';
import { Modal, useDialogs } from '../ui/Dialogs';
import { RecordingPlayer } from './RecordingPlayer';
import { DeleteRecording, ListRecordings, OpenRecordingsFolder, SearchRecordings } from '../../../wailsjs/go/main/App';

interface Info {
  name: string;
  title: string;
  startedAt: number;
  duration: number;
  size: number;
}
interface Hit {
  name: string;
  title: string;
  time: number;
  line: string;
  startedAt: number;
}

const when = (unix: number) => new Date(unix * 1000).toLocaleString();
const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s` : `${Math.floor(s)}s`);
const size = (b: number) => (b > 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function RecordingsDialog({ onClose }: { onClose: () => void }) {
  const dialogs = useDialogs();
  const [items, setItems] = useState<Info[]>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [playing, setPlaying] = useState<{ name: string; title: string } | null>(null);

  const reload = () =>
    ListRecordings()
      .then((l) => setItems((l ?? []) as Info[]))
      .catch((e) => dialogs.toast(String(e).replace(/^Error: /, ''), 'error'));
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced full-text search across all recordings.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits(null);
      return;
    }
    const t = window.setTimeout(() => {
      SearchRecordings(q)
        .then((h) => setHits((h ?? []) as Hit[]))
        .catch(() => setHits([]));
    }, 250);
    return () => window.clearTimeout(t);
  }, [query]);

  const remove = async (i: Info) => {
    if (!(await dialogs.confirm({ title: 'Delete recording?', message: `${i.title || i.name} (${when(i.startedAt)})`, confirmLabel: 'Delete', danger: true }))) return;
    await DeleteRecording(i.name).catch(() => {});
    await reload();
  };

  if (playing) {
    return (
      <Modal
        title={
          <span className="flex items-center gap-2">
            <button className="icon-btn -ml-1" aria-label="Back to recordings" onClick={() => setPlaying(null)}>
              <ArrowLeft size={15} />
            </button>
            {playing.title || playing.name}
          </span>
        }
        onClose={onClose}
        width="max-w-4xl"
      >
        <div className="px-5 pb-5 pt-1">
          <RecordingPlayer name={playing.name} />
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Session recordings" subtitle="Recordings show what the terminal displayed. Keyboard input is never recorded." onClose={onClose} width="max-w-2xl">
      <div className="px-5 pb-5 pt-1 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
            <input className="input-field pl-8" placeholder="Search text in all recordings" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          </div>
          <button className="btn-ghost h-8 px-2.5 inline-flex items-center gap-1.5" onClick={() => void OpenRecordingsFolder().catch(() => {})} title="Show the files in your file manager">
            <FolderOpen size={13} /> Folder
          </button>
        </div>

        {hits ? (
          <div className="max-h-[50vh] overflow-y-auto space-y-0.5">
            {hits.length === 0 && <p className="py-6 text-center text-[12.5px] text-gray-500">Nothing found.</p>}
            {hits.map((h, i) => (
              <button key={i} className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-white/[0.04]" onClick={() => setPlaying({ name: h.name, title: h.title })}>
                <div className="font-mono text-2xs text-gray-300 truncate">{h.line}</div>
                <div className="text-2xs text-gray-600">
                  {h.title || h.name} · {when(h.startedAt)} · at {dur(h.time)}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto space-y-0.5">
            {items.length === 0 && <p className="py-6 text-center text-[12.5px] text-gray-500">No recordings yet. Click REC in the status bar while connected.</p>}
            {items.map((i) => (
              <div key={i.name} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.04]">
                <button className="flex-1 min-w-0 text-left" onClick={() => setPlaying({ name: i.name, title: i.title })}>
                  <div className="text-[12.5px] text-gray-200 truncate">{i.title || i.name}</div>
                  <div className="text-2xs text-gray-500">
                    {when(i.startedAt)} · {dur(i.duration)} · {size(i.size)}
                  </div>
                </button>
                <button className="icon-btn opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`Delete ${i.title || i.name}`} onClick={() => void remove(i)}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
