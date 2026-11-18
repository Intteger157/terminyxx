import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Cable,
  Cloud,
  Columns2,
  Copy,
  FileDown,
  FolderPlus,
  Monitor,
  Pencil,
  Play,
  Plus,
  Server,
  SlidersHorizontal,
  Star,
  Tag,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';
import type { ImportItem } from './ImportDialog';
import type { Folder, HostMeta, RDPProfile, SSHProfile, StreamProfile } from '../../types';
import { errorText, useDialogs } from '../ui/Dialogs';
import { useContextMenu } from '../ui/ContextMenu';
import type { MenuEntry } from '../ui/ContextMenu';
import type { TreeActions } from './HostTree';
import type { DragItem, FolderNode, HostItem, MetaMap } from './tree';
import { FOLDER_COLORS, buildTree, emptyMeta, folderOptions, hostItems, hostsUnder, metaKey } from './tree';
import { rdpForSave, sshForSave, streamForSave } from '../../lib/profiles';
import { planJumps } from '../../lib/importJumps';
import { copyText } from '../../lib/clipboard';
import { useAppLock } from '../../lib/appLock';
import {
  DeleteFolder,
  DeleteRDPProfile,
  DeleteSSHProfile,
  DeleteStreamProfile,
  ExportSSHConfig,
  ListFolders,
  ListHostMeta,
  ListRDPProfiles,
  ListSSHProfiles,
  ListStreamProfiles,
  MoveItem,
  SaveFolder,
  SaveHostMeta,
  SaveRDPProfile,
  SaveSSHProfile,
  SaveStreamProfile,
} from '../../../wailsjs/go/main/App';

interface Options {
  connectSSH: (p: SSHProfile) => void;
  editSSH: (p: SSHProfile) => void;
  newSSH: (folderId: string) => void;
  editRDP: (p: RDPProfile) => void;
  /** external: open in the system's RDP client instead of a tab. */
  connectRDP: (p: RDPProfile, external?: boolean) => void;
  newRDP: (folderId: string) => void;
  connectStream: (p: StreamProfile) => void;
  editStream: (p: StreamProfile) => void;
  newStream: (folderId: string) => void;
  /** Opens several hosts: each in its own tab, or all as panes of one tab. */
  openMany: (hosts: HostItem[], split: boolean) => void;
  /** Opens the bulk editor for these hosts. */
  bulkEdit: (hosts: HostItem[]) => void;
  /** Opens the cloud inventory manager. */
  openInventories: () => void;
}

/** Saved hosts, folders, and every sidebar action on them. */
export function useHostLibrary(opts: Options) {
  const dialogs = useDialogs();
  const openMenu = useContextMenu();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [ssh, setSSH] = useState<SSHProfile[]>([]);
  const [rdp, setRDP] = useState<RDPProfile[]>([]);
  const [streams, setStreams] = useState<StreamProfile[]>([]);
  const [meta, setMetaState] = useState<MetaMap>(new Map());
  // The latest map, so saves read it without waiting for a render.
  const metaRef = useRef<MetaMap>(meta);
  const setMeta = useCallback((m: MetaMap) => {
    metaRef.current = m;
    setMetaState(m);
  }, []);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  /** True once the hosts were read at least once (after unlocking). */
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [f, s, r, st, m] = await Promise.all([ListFolders(), ListSSHProfiles(), ListRDPProfiles(), ListStreamProfiles(), ListHostMeta()]);
      setMeta(new Map((m ?? []).map((x) => [metaKey(x.kind, x.id), x as HostMeta])));
      setFolders(f ?? []);
      setSSH(s ?? []);
      setRDP(r ?? []);
      setStreams((st ?? []) as StreamProfile[]);
      setLoaded(true);
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

  const hosts = useMemo(() => hostItems(ssh, rdp, streams, meta), [ssh, rdp, streams, meta]);
  const tree = useMemo(() => buildTree(folders, hosts), [folders, hosts]);

  /** Saves a host's star, tags or notes (and shows the change at once). */
  const saveMeta = useCallback(
    async (kind: string, id: string, patch: Partial<HostMeta>) => {
      const key = metaKey(kind, id);
      const next: HostMeta = { ...(metaRef.current.get(key) ?? emptyMeta(kind, id)), ...patch, kind, id };
      setMeta(new Map(metaRef.current).set(key, next));
      try {
        await SaveHostMeta(next);
      } catch (err) {
        dialogs.toast(`Could not save: ${errorText(err)}`, 'error');
      }
    },
    [dialogs, setMeta]
  );

  /** Marks a host as just opened, for the Recent list (the backend stores it). */
  const touched = useCallback((kind: string, id: string) => {
    const key = metaKey(kind, id);
    const prev = metaRef.current;
    setMeta(new Map(prev).set(key, { ...(prev.get(key) ?? emptyMeta(kind, id)), lastUsed: Date.now() }));
  }, [setMeta]);

  const toggleFavorite = (list: HostItem[]) => {
    const on = !list.every((h) => h.meta.favorite);
    list.forEach((h) => void saveMeta(h.kind, h.id, { favorite: on }));
  };

  const addTag = async (list: HostItem[]) => {
    const tag = await dialogs.prompt({
      title: list.length > 1 ? `Add a tag to ${list.length} hosts` : 'Add a tag',
      label: 'Tag (search the sidebar with #tag):',
      confirmLabel: 'Add',
    });
    const t = tag?.trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-');
    if (!t) return;
    list.forEach((h) => {
      if (!h.meta.tags.includes(t)) void saveMeta(h.kind, h.id, { tags: [...h.meta.tags, t] });
    });
  };

  const exportConfig = async (list: HostItem[]) => {
    const ids = list.filter((h) => h.kind === 'ssh').map((h) => h.id);
    if (ids.length === 0) {
      dialogs.toast('Only SSH hosts can be exported to an ssh config file.', 'error');
      return;
    }
    try {
      const path = await ExportSSHConfig(ids);
      if (path) dialogs.toast(`Exported to ${path}`, 'success');
    } catch (err) {
      dialogs.toast(`Export failed: ${errorText(err)}`, 'error');
    }
  };

  const duplicateHost = (h: HostItem) => {
    const id = crypto.randomUUID();
    const name = `${h.name} copy`;
    const copyMeta = () =>
      h.meta.tags.length || h.meta.notes ? SaveHostMeta({ ...h.meta, kind: h.kind, id, favorite: false, lastUsed: 0 }) : Promise.resolve();
    if (h.kind === 'ssh')
      return run('Could not duplicate', async () => {
        const proxy = h.profile.proxy ? { ...h.profile.proxy, password: '', hasPassword: false } : undefined;
        await SaveSSHProfile(sshForSave({ ...h.profile, id, name, password: '', hasPassword: false, proxy }));
        await copyMeta();
      });
    if (h.kind === 'rdp')
      return run('Could not duplicate', async () => {
        await SaveRDPProfile(rdpForSave({ ...h.profile, id, name, password: '', hasPassword: false }));
        await copyMeta();
      });
    return run('Could not duplicate', async () => {
      await SaveStreamProfile(streamForSave({ ...h.profile, id, name }));
      await copyMeta();
    });
  };

  const deleteHosts = async (list: HostItem[]) => {
    const ok = await dialogs.confirm({
      title: `Delete ${list.length} hosts`,
      message: `Delete ${list.length} saved hosts? Open sessions stay connected. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await run('Could not delete hosts', async () => {
      for (const h of list) {
        await (h.kind === 'ssh' ? DeleteSSHProfile(h.id) : h.kind === 'rdp' ? DeleteRDPProfile(h.id) : DeleteStreamProfile(h.id));
      }
    });
  };

  /** Context menu for a multi-selection. */
  const selectionMenu = (e: React.MouseEvent, list: HostItem[]) => {
    const allFav = list.every((h) => h.meta.favorite);
    const sshCount = list.filter((h) => h.kind === 'ssh').length;
    openMenu(e, [
      { label: `Open ${list.length} hosts in tabs`, icon: <Play size={13} />, onSelect: () => opts.openMany(list, false) },
      { label: 'Open in one tab, split', icon: <Columns2 size={13} />, onSelect: () => opts.openMany(list, true) },
      { type: 'separator' },
      { label: `Edit ${list.length} hosts…`, icon: <SlidersHorizontal size={13} />, onSelect: () => opts.bulkEdit(list) },
      { label: allFav ? 'Remove from favorites' : 'Add to favorites', icon: <Star size={13} />, onSelect: () => toggleFavorite(list) },
      { label: 'Add tag…', icon: <Tag size={13} />, onSelect: () => void addTag(list) },
      {
        label: sshCount ? `Export ${sshCount} to ssh config…` : 'Export to ssh config…',
        icon: <FileDown size={13} />,
        disabled: sshCount === 0,
        onSelect: () => void exportConfig(list),
      },
      { type: 'separator' },
      { label: `Delete ${list.length} hosts`, icon: <Trash2 size={13} />, danger: true, onSelect: () => void deleteHosts(list) },
    ]);
  };
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
    await run('Could not delete host', () =>
      h.kind === 'ssh' ? DeleteSSHProfile(h.id) : h.kind === 'rdp' ? DeleteRDPProfile(h.id) : DeleteStreamProfile(h.id)
    );
  };

  const openHost = (h: HostItem) => {
    if (h.kind === 'ssh') opts.connectSSH(h.profile);
    else if (h.kind === 'rdp') opts.connectRDP(h.profile);
    else opts.connectStream(h.profile);
  };

  const hostMenu = (e: React.MouseEvent, h: HostItem) => {
    const edit = () => (h.kind === 'ssh' ? opts.editSSH(h.profile) : h.kind === 'rdp' ? opts.editRDP(h.profile) : opts.editStream(h.profile));
    const entries: MenuEntry[] = [
      { label: 'Connect', icon: <Play size={13} />, onSelect: () => openHost(h) },
      ...(h.kind === 'rdp'
        ? [{ label: 'Open in system client', icon: <Monitor size={13} />, onSelect: () => opts.connectRDP(h.profile, true) } as MenuEntry]
        : []),
      { label: 'Edit…', icon: <Pencil size={13} />, onSelect: edit },
      { label: 'Duplicate', icon: <Copy size={13} />, onSelect: () => void duplicateHost(h) },
      ...(h.kind === 'ssh'
        ? [
            {
              label: 'Copy address',
              icon: <Copy size={13} />,
              hint: h.detail,
              onSelect: () => void copyText(`${h.profile.username}@${h.profile.host}`),
            } as MenuEntry,
            { label: 'Export to ssh config…', icon: <FileDown size={13} />, onSelect: () => void exportConfig([h]) } as MenuEntry,
          ]
        : []),
      { type: 'separator' },
      {
        label: h.meta.favorite ? 'Remove from favorites' : 'Add to favorites',
        icon: <Star size={13} />,
        onSelect: () => toggleFavorite([h]),
      },
      { label: 'Add tag…', icon: <Tag size={13} />, onSelect: () => void addTag([h]) },
      { type: 'separator' },
      { label: 'Delete', icon: <Trash2 size={13} />, danger: true, onSelect: () => deleteHost(h) },
    ];
    openMenu(e, entries);
  };

  const folderMenu = (e: React.MouseEvent, node: FolderNode) => {
    const f = node.folder;
    const all = hostsUnder(node);
    const sshCount = all.filter((h) => h.kind === 'ssh').length;
    openMenu(e, [
      { label: 'New SSH host here', icon: <Server size={13} />, onSelect: () => opts.newSSH(f.id) },
      { label: 'New RDP profile here', icon: <Monitor size={13} />, onSelect: () => opts.newRDP(f.id) },
      { label: 'New Telnet or serial connection here', icon: <Cable size={13} />, onSelect: () => opts.newStream(f.id) },
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
        label: all.length > 0 ? `Open all (${all.length})` : 'Open all',
        icon: <Zap size={13} />,
        disabled: all.length === 0,
        onSelect: () => opts.openMany(all, false),
      },
      {
        label: 'Open all in one tab, split',
        icon: <Columns2 size={13} />,
        disabled: all.length < 2,
        onSelect: () => opts.openMany(all, true),
      },
      { label: 'Edit all hosts…', icon: <SlidersHorizontal size={13} />, disabled: all.length === 0, onSelect: () => opts.bulkEdit(all) },
      {
        label: sshCount ? `Export ${sshCount} to ssh config…` : 'Export to ssh config…',
        icon: <FileDown size={13} />,
        disabled: sshCount === 0,
        onSelect: () => void exportConfig(all),
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
      { label: 'New Telnet or serial connection', icon: <Cable size={13} />, onSelect: () => opts.newStream('') },
      { label: 'New folder', icon: <FolderPlus size={13} />, onSelect: () => newFolder('') },
      { type: 'separator' },
      { label: 'Import from another app…', icon: <Upload size={13} />, onSelect: () => setImportOpen(true) },
      { label: 'Cloud inventories…', icon: <Cloud size={13} />, onSelect: () => opts.openInventories() },
    ]);
  };

  const move = (item: DragItem, parentId: string, index: number) =>
    run('Could not move', () => MoveItem(item.kind, item.id, parentId, index));

  const actions: TreeActions = {
    openHost,
    hostMenu,
    selectionMenu,
    toggleFavorite: (h) => toggleFavorite([h]),
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

    const ids = new Map(items.map((it) => [it.key, crypto.randomUUID()]));
    const plan = planJumps(
      items.filter((it) => it.kind === 'ssh').map((it) => ({ index: it.index, id: ids.get(it.key)!, user: it.user, jump: it.jump })),
      ssh
    );

    let failed = 0;
    // Jump hosts nothing matched are added next to the first host that needs them.
    const hopFolder = new Map<string, string>();
    for (const it of items) {
      try {
        const folderId = await ensureFolder([...(rootFolder ? [rootFolder] : []), ...(keepFolders ? it.folder : [])]);
        const id = ids.get(it.key)!;
        for (let j = plan.jumpOf.get(id); j && !hopFolder.has(j); j = plan.jumpOf.get(j)) hopFolder.set(j, folderId);
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
              id,
              jumpProfileId: plan.jumpOf.get(id) ?? '',
              name: it.name,
              host: it.host,
              port: it.port,
              username: it.user,
              authType: it.keyFile ? 'key' : 'password',
              password: '',
              keyPath: it.keyFile,
              folderId,
              x11Forwarding: !!it.x11,
              proxy: it.proxyCommand && !plan.jumpOf.get(id) ? { type: 'command', host: '', port: 0, username: '', password: '', command: it.proxyCommand } : undefined,
            })
          );
        }
      } catch {
        failed++;
      }
    }
    let hops = 0;
    for (const h of plan.created) {
      try {
        await SaveSSHProfile(
          sshForSave({
            id: h.id,
            jumpProfileId: plan.jumpOf.get(h.id) ?? '',
            name: h.user ? `${h.user}@${h.host}` : h.host,
            host: h.host,
            port: h.port,
            username: h.user,
            authType: 'password',
            password: '',
            keyPath: '',
            folderId: hopFolder.get(h.id) ?? (await ensureFolder(rootFolder ? [rootFolder] : [])),
          })
        );
        hops++;
      } catch {
        failed++;
      }
    }
    await reload();
    setImportOpen(false);
    const done = `Imported ${items.length + hops - failed} host${items.length + hops - failed === 1 ? '' : 's'}${hops ? ` (${hops} jump host${hops === 1 ? '' : 's'} added)` : ''}`;
    dialogs.toast(failed ? `${done}, ${failed} failed` : done, failed ? 'error' : 'success');
  };

  return {
    folders,
    ssh,
    rdp,
    streams,
    hosts,
    meta,
    saveMeta,
    touched,
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
    loaded,
  };
}
