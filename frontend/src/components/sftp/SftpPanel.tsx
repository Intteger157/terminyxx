import { useCallback, useEffect, useMemo, useState } from 'react';
import { FilePane } from './FilePane';
import { useHotkeys } from '../../hooks/useHotkeys';
import { useWailsEvent } from '../../hooks/useWailsEvents';
import type { ActivePane, FileEntry, TransferProgress } from '../../types';
import {
  GetLocalHome,
  GetRemoteHome,
  ListLocalDir,
  SFTPDownload,
  SFTPListDir,
  SFTPMkdir,
  SFTPReadFile,
  SFTPRemove,
  SFTPUpload,
  ReadLocalFile,
} from '../../../wailsjs/go/main/App';

interface SftpPanelProps {
  connectionId: string;
  open: boolean;
}

export function SftpPanel({ connectionId, open }: SftpPanelProps) {
  const [localPath, setLocalPath] = useState('');
  const [remotePath, setRemotePath] = useState('/');
  const [localEntries, setLocalEntries] = useState<FileEntry[]>([]);
  const [remoteEntries, setRemoteEntries] = useState<FileEntry[]>([]);
  const [localSelected, setLocalSelected] = useState<FileEntry | null>(null);
  const [remoteSelected, setRemoteSelected] = useState<FileEntry | null>(null);
  const [activePane, setActivePane] = useState<ActivePane>('local');
  const [loading, setLoading] = useState({ local: false, remote: false });
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [viewerContent, setViewerContent] = useState<string | null>(null);
  const [viewerTitle, setViewerTitle] = useState('');

  const loadLocal = useCallback(async (dir: string) => {
    setLoading((s) => ({ ...s, local: true }));
    try {
      const entries = await ListLocalDir(dir);
      setLocalEntries(entries);
      setLocalPath(dir);
    } catch (err) {
      console.error('load local:', err);
    } finally {
      setLoading((s) => ({ ...s, local: false }));
    }
  }, []);

  const loadRemote = useCallback(async (dir: string) => {
    setLoading((s) => ({ ...s, remote: true }));
    try {
      const entries = await SFTPListDir(connectionId, dir);
      setRemoteEntries(entries);
      setRemotePath(dir);
    } catch (err) {
      console.error('load remote:', err);
    } finally {
      setLoading((s) => ({ ...s, remote: false }));
    }
  }, [connectionId]);

  useEffect(() => {
    if (!open) return;
    GetLocalHome().then(loadLocal).catch(console.error);
    GetRemoteHome(connectionId).then(loadRemote).catch(() => loadRemote('/'));
  }, [open, connectionId, loadLocal, loadRemote]);

  useWailsEvent<TransferProgress>(`sftp:progress:${connectionId}`, (data) => {
    setProgress(data);
    if (data.transferred >= data.total) {
      setTimeout(() => setProgress(null), 1000);
    }
  }, [connectionId]);

  const copyFiles = async () => {
    if (activePane === 'local' && localSelected) {
      const dest = remotePath.endsWith('/')
        ? remotePath + localSelected.name
        : remotePath + '/' + localSelected.name;
      await SFTPUpload(connectionId, localSelected.path, dest);
      await loadRemote(remotePath);
    } else if (activePane === 'remote' && remoteSelected) {
      const dest = localPath.endsWith('/')
        ? localPath + remoteSelected.name
        : localPath + '/' + remoteSelected.name;
      await SFTPDownload(connectionId, remoteSelected.path, dest);
      await loadLocal(localPath);
    }
  };

  const moveFiles = async () => {
    await copyFiles();
    if (activePane === 'local' && localSelected) {
      // local move not implemented via backend — copy only for remote
    } else if (activePane === 'remote' && remoteSelected) {
      await SFTPRemove(connectionId, remoteSelected.path);
      await loadRemote(remotePath);
    }
  };

  const deleteSelected = async () => {
    if (activePane === 'remote' && remoteSelected) {
      if (!confirm(`Удалить ${remoteSelected.name}?`)) return;
      await SFTPRemove(connectionId, remoteSelected.path);
      setRemoteSelected(null);
      await loadRemote(remotePath);
    }
  };

  const mkdir = async () => {
    const name = prompt('Имя каталога:');
    if (!name) return;
    if (activePane === 'remote') {
      const dir = remotePath.endsWith('/') ? remotePath + name : remotePath + '/' + name;
      await SFTPMkdir(connectionId, dir);
      await loadRemote(remotePath);
    }
  };

  const viewFile = async () => {
    if (activePane === 'local' && localSelected && !localSelected.isDir) {
      const content = await ReadLocalFile(localSelected.path);
      setViewerContent(content);
      setViewerTitle(localSelected.name);
    } else if (activePane === 'remote' && remoteSelected && !remoteSelected.isDir) {
      const content = await SFTPReadFile(connectionId, remoteSelected.path);
      setViewerContent(content);
      setViewerTitle(remoteSelected.name);
    }
  };

  const hotkeyMap = useMemo(() => ({
    F3: () => { void viewFile(); },
    F5: () => { void copyFiles(); },
    F6: () => { void moveFiles(); },
    F7: () => { void mkdir(); },
    F8: () => { void deleteSelected(); },
    Tab: (e: KeyboardEvent) => {
      e.preventDefault();
      setActivePane((p) => (p === 'local' ? 'remote' : 'local'));
    },
  }), [activePane, localSelected, remoteSelected, localPath, remotePath, connectionId]);

  useHotkeys(hotkeyMap, open);

  if (!open) return null;

  return (
    <div className="flex flex-col h-64 border-t border-border bg-surface">
      <div className="flex items-center justify-between px-3 py-1 bg-surface-raised border-b border-border">
        <span className="text-xs text-gray-400">
          SFTP — F3 просмотр · F5 копировать · F6 переместить · F7 mkdir · F8 удалить · Tab панель
        </span>
        {progress && (
          <span className="text-xs text-accent">
            {progress.operation}: {Math.round((progress.transferred / progress.total) * 100)}%
          </span>
        )}
      </div>
      <div className="flex flex-1 gap-2 p-2 min-h-0">
        <FilePane
          title="Локальная"
          path={localPath}
          entries={localEntries}
          selected={localSelected}
          active={activePane === 'local'}
          loading={loading.local}
          onSelect={(e) => { setLocalSelected(e); setActivePane('local'); }}
          onNavigate={(e) => loadLocal(e.path)}
          onPathChange={loadLocal}
        />
        <FilePane
          title="Удалённая"
          path={remotePath}
          entries={remoteEntries}
          selected={remoteSelected}
          active={activePane === 'remote'}
          loading={loading.remote}
          onSelect={(e) => { setRemoteSelected(e); setActivePane('remote'); }}
          onNavigate={(e) => loadRemote(e.path)}
          onPathChange={loadRemote}
        />
      </div>

      {viewerContent !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-surface-raised border border-border rounded-lg w-full max-w-2xl max-h-[70vh] flex flex-col shadow-xl">
            <div className="px-4 py-2 border-b border-border flex justify-between items-center">
              <span className="text-sm font-semibold">{viewerTitle}</span>
              <button className="btn-ghost" onClick={() => setViewerContent(null)}>Закрыть</button>
            </div>
            <pre className="p-4 overflow-auto text-xs text-gray-300 flex-1">{viewerContent}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
