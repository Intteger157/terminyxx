import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Copy,
  FolderPlus,
  Monitor,
  Pencil,
  Play,
  Plus,
  Server,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';
import type { ImportItem } from './ImportDialog';
import type { Folder, RDPProfile, SSHProfile } from '../../types';
import { errorText, useDialogs } from '../ui/Dialogs';
import { useContextMenu } from '../ui/ContextMenu';
import type { MenuEntry } from '../ui/ContextMenu';
import type { TreeActions } from './HostTree';
import type { DragItem, FolderNode, HostItem } from './tree';
import { FOLDER_COLORS, buildTree, folderOptions, hostItems, hostsUnder } from './tree';
import { rdpForSave, sshForSave } from '../../lib/profiles';
import { copyText } from '../../lib/clipboard';
import { useAppLock } from '../../lib/appLock';
import {
  DeleteFolder,
  DeleteRDPProfile,
  DeleteSSHProfile,
  ListFolders,
  ListRDPProfiles,
  ListSSHProfiles,
  MoveItem,
  SaveFolder,
  SaveRDPProfile,
  SaveSSHProfile,
} from '../../../wailsjs/go/main/App';

interface Options {
  connectSSH: (p: SSHProfile) => void;
  editSSH: (p: SSHProfile) => void;
  newSSH: (folderId: string) => void;
  editRDP: (p: RDPProfile) => void;
  /** external: open in the system's RDP client instead of a tab. */
  connectRDP: (p: RDPProfile, external?: boolean) => void;
  newRDP: (folderId: string) => void;
}

/** Saved hosts, folders, and every sidebar action on them. */
export function useHostLibrary(opts: Options) {
  const dialogs = useDialogs();
  const openMenu = useContextMenu();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [ssh, setSSH] = useState<SSHProfile[]>([]);
  const [rdp, setRDP] = useState<RDPProfile[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [f, s, r] = await Promise.all([ListFolders(), ListSSHProfiles(), ListRDPProfiles()]);
      setFolders(f ?? []);
      setSSH(s ?? []);
      setRDP(r ?? []);
    } catch (err) {
      dialogs.toast(`Failed to load hosts: ${errorText(err)}`, 'error');
    }
  }, [dialogs]);

  // The backend refuses to list hosts while the app is locked, so load them
  // once it is open (at startup with a master password, and after each unlock).
  const { locked, ready } = useAppLock();
  useEffect(() => {
    if (ready && !locked) reload();
  }, [reload, locked, ready]);

  const tree = useMemo(() => buildTree(folders, hostItems(ssh, rdp)), [folders, ssh, rdp]);
  const folderChoices = useMemo(() => folderOptions(tree), [tree]);

  const run = async (what: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      dialogs.toast(`${what}: ${errorText(err)}`, 'error');
    }
    await reload();
  };

  const newFolder = async (parentId = '') => {
    const id = crypto.randomUUID();
    await run('Could not create folder', () => SaveFolder({ id, name: 'New folder', parentId, color: '', sortOrder: 0 }));
    setRenamingId(id);
  };

  const deleteFolder = async (node: FolderNode) => {
    const ok = await dialogs.confirm({
      title: `Delete folder “${node.folder.name}”`,
      message:
        node.total > 0 || node.folders.length > 0
          ? 'Its hosts and subfolders are kept and move up one level.'
          : 'The folder is empty.',
      confirmLabel: 'Delete folder',
      danger: true,
    });
    if (ok) await run('Could not delete folder', () => DeleteFolder(node.folder.id));
  };

  const deleteHost = async (h: HostItem) => {
    const ok = await dialogs.confirm({
      title: 'Delete host',
      message: `Delete the saved host “${h.name}”? Open sessions stay connected.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await run('Could not delete host', () => (h.kind === 'ssh' ? DeleteSSHProfile(h.id) : DeleteRDPProfile(h.id)));
  };

  const connectAll = (node: FolderNode) => {
    const list = hostsUnder(node).filter((h) => h.kind === 'ssh');
    list.forEach((h) => opts.connectSSH(h.profile as SSHProfile));
  };

  const openHost = (h: HostItem) => {
    if (h.kind === 'ssh') opts.connectSSH(h.profile);
    else opts.connectRDP(h.profile);
  };

  const hostMenu = (e: React.MouseEvent, h: HostItem) => {
    const entries: MenuEntry[] =
      h.kind === 'ssh'
        ? [
            { label: 'Connect', icon: <Play size={13} />, onSelect: () => openHost(h) },
            { label: 'Edit…', icon: <Pencil size={13} />, onSelect: () => opts.editSSH(h.profile) },
            {
              label: 'Duplicate',
              icon: <Copy size={13} />,
              onSelect: () =>
                run('Could not duplicate', () =>
                  SaveSSHProfile(sshForSave({ ...h.profile, id: crypto.randomUUID(), name: `${h.name} copy`, password: '', hasPassword: false }))
                ),
            },
            {
              label: 'Copy address',
              icon: <Copy size={13} />,
              hint: h.detail,
              onSelect: () => void copyText(`${h.profile.username}@${h.profile.host}`),
            },
            { type: 'separator' },
            { label: 'Delete', icon: <Trash2 size={13} />, danger: true, onSelect: () => deleteHost(h) },
          ]
        : [
            { label: 'Connect', icon: <Play size={13} />, onSelect: () => openHost(h) },
            { label: 'Open in system client', icon: <Monitor size={13} />, onSelect: () => opts.connectRDP(h.profile, true) },
            { label: 'Edit…', icon: <Pencil size={13} />, onSelect: () => opts.editRDP(h.profile) },
            { type: 'separator' },
            { label: 'Delete', icon: <Trash2 size={13} />, danger: true, onSelect: () => deleteHost(h) },
          ];
    openMenu(e, entries);
  };

  const folderMenu = (e: React.MouseEvent, node: FolderNode) => {
    const f = node.folder;
    const sshCount = hostsUnder(node).filter((h) => h.kind === 'ssh').length;
    openMenu(e, [
      { label: 'New SSH host here', icon: <Server size={13} />, onSelect: () => opts.newSSH(f.id) },
      { label: 'New RDP profile here', icon: <Monitor size={13} />, onSelect: () => opts.newRDP(f.id) },
      { label: 'New subfolder', icon: <FolderPlus size={13} />, onSelect: () => newFolder(f.id) },
      { type: 'separator' },
      { label: 'Rename', icon: <Pencil size={13} />, onSelect: () => setRenamingId(f.id) },
      {
        type: 'custom',
        render: (close) => (
          <div className="flex items-center gap-1 px-2.5 py-1.5">
            {FOLDER_COLORS.map((c) => (
              <button
                key={c || 'none'}
                title={c ? c : 'No color'}
                onClick={() => {
                  close();
                  run('Could not recolor folder', () => SaveFolder({ ...f, color: c }));
                }}
                className={`w-4 h-4 rounded-full transition-transform hover:scale-125 ${f.color === c ? 'ring-2 ring-offset-1 ring-offset-surface-raised ring-white/70' : ''}`}
                style={{ background: c || 'transparent', boxShadow: c ? undefined : 'inset 0 0 0 1.5px rgb(161 161 170 / 0.6)' }}
              />
            ))}
          </div>
        ),
      },
      {
        label: sshCount > 0 ? `Connect all (${sshCount})` : 'Connect all',
        icon: <Zap size={13} />,
        disabled: sshCount === 0,
        onSelect: () => connectAll(node),
      },
      { type: 'separator' },
      { label: 'Delete folder', icon: <Trash2 size={13} />, danger: true, onSelect: () => deleteFolder(node) },
    ]);
  };

  const backgroundMenu = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget && (e.target as HTMLElement).closest('[draggable="true"]')) return;
    openMenu(e, [
      { label: 'New SSH host', icon: <Plus size={13} />, onSelect: () => opts.newSSH('') },
      { label: 'New RDP profile', icon: <Monitor size={13} />, onSelect: () => opts.newRDP('') },
      { label: 'New folder', icon: <FolderPlus size={13} />, onSelect: () => newFolder('') },
      { type: 'separator' },
      { label: 'Import from another app…', icon: <Upload size={13} />, onSelect: () => setImportOpen(true) },
    ]);
  };

  const move = (item: DragItem, parentId: string, index: number) =>
    run('Could not move', () => MoveItem(item.kind, item.id, parentId, index));

  const actions: TreeActions = {
    openHost,
    hostMenu,
    folderMenu,
    move,
    renameFolder: (id, name) => {
      const f = folders.find((x) => x.id === id);
      if (f) run('Could not rename folder', () => SaveFolder({ ...f, name }));
    },
  };

  const importHosts = async (items: ImportItem[], rootFolder: string, keepFolders: boolean) => {
    // Reuse folders with the same name under the same parent.
    const known = folders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId }));
    const ensureFolder = async (path: string[]): Promise<string> => {
      let parent = '';
      for (const name of path) {
        let f = known.find((x) => x.parentId === parent && x.name === name);
        if (!f) {
          f = { id: crypto.randomUUID(), name, parentId: parent };
          await SaveFolder({ ...f, color: '', sortOrder: 0 });
          known.push(f);
        }
        parent = f.id;
      }
      return parent;
    };

    let failed = 0;
    for (const it of items) {
      try {
        const folderId = await ensureFolder([...(rootFolder ? [rootFolder] : []), ...(keepFolders ? it.folder : [])]);
        if (it.kind === 'rdp') {
          await SaveRDPProfile(
            rdpForSave({
              id: crypto.randomUUID(),
              name: it.name,
              host: it.host,
              port: it.port,
              username: it.user,
              domain: it.domain,
              password: '',
              width: it.width || 1920,
              height: it.height || 1080,
              fullscreen: it.fullscreen,
              folderId,
            })
          );
        } else {
          await SaveSSHProfile(
            sshForSave({
              id: crypto.randomUUID(),
              name: it.name,
              host: it.host,
              port: it.port,
              username: it.user,
              authType: it.keyFile ? 'key' : 'password',
              password: '',
              keyPath: it.keyFile,
              folderId,
            })
          );
        }
      } catch {
        failed++;
      }
    }
    await reload();
    setImportOpen(false);
    dialogs.toast(
      failed ? `Imported ${items.length - failed}, ${failed} failed` : `Imported ${items.length} host${items.length === 1 ? '' : 's'}`,
      failed ? 'error' : 'success'
    );
  };

  return {
    folders,
    ssh,
    rdp,
    tree,
    folderChoices,
    reload,
    actions,
    renamingId,
    setRenamingId,
    newFolder,
    backgroundMenu,
    importOpen,
    setImportOpen,
    importHosts,
    deleteHost,
  };
}
