import { FolderOpen, Plug, PlugZap, Terminal } from 'lucide-react';

interface ToolbarProps {
  connected: boolean;
  sftpOpen: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleSftp: () => void;
}

export function Toolbar({
  connected,
  sftpOpen,
  onConnect,
  onDisconnect,
  onToggleSftp,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-1 px-3 py-1.5 bg-surface-raised border-b border-border">
      {!connected ? (
        <button className="btn-primary flex items-center gap-1.5" onClick={onConnect}>
          <Plug size={14} />
          Подключить
        </button>
      ) : (
        <>
          <button className="btn-ghost flex items-center gap-1.5 text-red-400 hover:text-red-300" onClick={onDisconnect}>
            <PlugZap size={14} />
            Отключить
          </button>
          <div className="w-px h-5 bg-border mx-1" />
          <button
            className={`btn-ghost flex items-center gap-1.5 ${sftpOpen ? 'text-accent' : ''}`}
            onClick={onToggleSftp}
            title="SFTP (Ctrl+Shift+F)"
          >
            <FolderOpen size={14} />
            SFTP
          </button>
        </>
      )}
      <div className="flex-1" />
      <span className="text-xs text-gray-500 flex items-center gap-1">
        <Terminal size={12} />
        xterm-256color
      </span>
    </div>
  );
}
