import { ChevronRight, File, Folder } from 'lucide-react';
import type { FileEntry } from '../../types';

interface FileRowProps {
  entry: FileEntry;
  selected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}

export function FileRow({ entry, selected, onClick, onDoubleClick }: FileRowProps) {
  return (
    <div
      className={`flex items-center gap-2 px-2 py-1 text-sm cursor-pointer select-none ${
        selected ? 'bg-accent/30 text-white' : 'hover:bg-surface-overlay text-gray-300'
      }`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {entry.isDir ? (
        <Folder size={14} className="text-yellow-500 flex-shrink-0" />
      ) : (
        <File size={14} className="text-gray-500 flex-shrink-0" />
      )}
      <span className="truncate flex-1">{entry.name}</span>
      {!entry.isDir && (
        <span className="text-xs text-gray-500 flex-shrink-0">{formatSize(entry.size)}</span>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FilePaneProps {
  title: string;
  path: string;
  entries: FileEntry[];
  selected: FileEntry | null;
  active: boolean;
  loading: boolean;
  onSelect: (entry: FileEntry) => void;
  onNavigate: (entry: FileEntry) => void;
  onPathChange: (path: string) => void;
}

export function FilePane({
  title,
  path,
  entries,
  selected,
  active,
  loading,
  onSelect,
  onNavigate,
  onPathChange,
}: FilePaneProps) {
  const goUp = () => {
    const parent = path.replace(/\/[^/]+\/?$/, '') || '/';
    onPathChange(parent);
  };

  return (
    <div className={`flex flex-col flex-1 min-w-0 border border-border rounded ${active ? 'ring-1 ring-accent' : ''}`}>
      <div className="px-3 py-1.5 bg-surface-raised border-b border-border text-xs font-semibold text-gray-400">
        {title}
      </div>
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-surface">
        <button className="btn-ghost p-0.5" onClick={goUp} title="Вверх">
          <ChevronRight size={14} className="rotate-[-90deg]" />
        </button>
        <input
          className="flex-1 bg-transparent text-xs text-gray-300 outline-none truncate"
          value={path}
          onChange={(e) => onPathChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onPathChange(path)}
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && <p className="px-3 py-2 text-xs text-gray-500">Загрузка...</p>}
        {!loading && entries.map((entry) => (
          <FileRow
            key={entry.path}
            entry={entry}
            selected={selected?.path === entry.path}
            onClick={() => onSelect(entry)}
            onDoubleClick={() => entry.isDir && onNavigate(entry)}
          />
        ))}
      </div>
    </div>
  );
}
