import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cable, Circle, Columns2, Copy, EyeOff, LayoutGrid, ScrollText, FolderPlus, FolderTree, Loader2, Lock, Monitor, Network, PanelLeft, Plus, RotateCw, Rows2, Server, Settings, ShieldCheck, SquareArrowOutUpRight, SquareTerminal, Unplug, Upload, X } from 'lucide-react';
import { Sidebar, MAX_WIDTH, MIN_WIDTH } from './components/sidebar/Sidebar';
import { ImportDialog } from './components/sidebar/ImportDialog';
import { useHostLibrary } from './components/sidebar/useHostLibrary';
import { folderPath, recentHosts, streamDetail } from './components/sidebar/tree';
import type { HostItem } from './components/sidebar/tree';
import { BulkEditDialog } from './components/sidebar/BulkEditDialog';
import { InventoriesDialog } from './components/sidebar/InventoriesDialog';
import { gridLayout } from './lib/layout';
import { rdpForSave, sshForSave, streamForSave } from './lib/profiles';
import { pruneRecordings } from './lib/recordingCleanup';
import { TitleBar } from './components/layout/TitleBar';
import { StatusBar } from './components/layout/StatusBar';
import { Welcome } from './components/layout/Welcome';
import { CommandPalette } from './components/CommandPalette';
import type { PaletteItem } from './components/CommandPalette';
import { XTermWrapper } from './components/terminal/XTermWrapper';
import { SplitView } from './components/terminal/SplitView';
import { useContextMenu } from './components/ui/ContextMenu';
import type { MenuEntry } from './components/ui/ContextMenu';
import { contains, insertPane, neighbor, paneIds, removePane, setSizes as setSplitSizes } from './lib/layout';
import type { Side, TabGroup } from './lib/layout';
import { setBroadcastPanes, toggleBroadcast, useBroadcast } from './lib/broadcast';
import { SnippetsDialog } from './components/snippets/SnippetsDialog';
import { StreamDialog } from './components/terminal/StreamDialog';
import type { StreamDialogState } from './components/terminal/StreamDialog';
import { ContainersDialog } from './components/terminal/ContainersDialog';
import { InstallKeyDialog } from './components/terminal/InstallKeyDialog';
import { SaveStreamProfile, StreamConnect, TouchHost } from '../wailsjs/go/main/App';
import { connection } from '../wailsjs/go/models';
import { RecordingsDialog } from './components/recordings/RecordingsDialog';
import type { PaneDrag } from './lib/paneDrag';
import { ConnectDialog } from './components/terminal/ConnectDialog';
import { SSHDiagnosticDialog } from './components/terminal/SSHDiagnostic';
import { SftpPanel } from './components/sftp/SftpPanel';
import { RdpDialog } from './components/rdp/RdpDialog';
import { RdpPane } from './components/rdp/RdpPane';
import { openRdpSession } from './lib/rdpConnect';
import { SettingsDialog } from './components/settings/SettingsDialog';
import type { SettingsSection } from './components/settings/SettingsDialog';
import { useDialogs, errorText, modalSwap } from './components/ui/Dialogs';
import { checkForUpdate, loadVersion } from './lib/updates';
import { useHotkeys } from './hooks/useHotkeys';
import { ConnectCancelled, ConnectNeedsUser, connectWithPrompts, SSHConnectFailure } from './lib/connect';
import { identityById, reloadIdentities, saveIdentity } from './lib/identities';
import { deleteWorkspace, instantiate, loadLastSession, loadWorkspaces, prune, rememberSession, saveWorkspace, snapshot, useWorkspaces } from './lib/workspaces';
import type { Workspace, WorkspacePane } from './lib/workspaces';
import { LockScreen } from './components/security/LockScreen';
import { lockNow, useAppLock } from './lib/appLock';
import { setClipboardNotifier } from './lib/clipboard';
import { getSettings, updateSecurity, useSettings } from './lib/settings';
import { modKey, usePlatform } from './lib/hosts';
import type { QuickTarget } from './lib/hosts';
import type { RDPProfile, SSHProfile, StreamProfile, StreamSpec, TerminalTab } from './types';
import { EventsOn, WindowFullscreen, WindowIsFullscreen, WindowUnfullscreen } from '../wailsjs/runtime/runtime';
import { LaunchRDP, RDPClose, SaveRDPProfile, SaveSSHProfile, SSHDisconnect } from '../wailsjs/go/main/App';

type ConnectDialogState = { key: number; tabId: string | null; initial?: Partial<SSHProfile> } | null;

const SIDEBAR_KEY = 'terminyxx.sidebar.v2';

/** Automatic reconnect: delays 1, 2, 4, 8, 16, then 30 s; about five minutes in all. */
const RETRY_MAX = 14;
const retryDelay = (attempt: number) => Math.min(30, 2 ** (attempt - 1)) * 1000;

interface SidebarPref {
  width: number;
  rail: boolean;
}

function readSidebarPref(): SidebarPref {
  try {
    const v = JSON.parse(localStorage.getItem(SIDEBAR_KEY) ?? '');
    if (typeof v.width === 'number') return { width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, v.width)), rail: !!v.rail };
  } catch {
    // first run or storage unavailable
  }
  return { width: 248, rail: false };
}

/** Tab title of a Telnet or serial session: the saved name, else the address. */
const streamTitle = (s: StreamSpec) => s.name || (s.kind === 'telnet' ? `telnet ${s.host}` : s.device);
const streamHost = (s: StreamSpec) => (s.kind === 'telnet' ? s.host : s.device);

function App() {
  const dialogs = useDialogs();
  const platform = usePlatform();
  const mod = modKey(platform);
  const openMenu = useContextMenu();
  // Sessions (one per terminal) and the title-bar tabs that lay them out.
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [sshDiagnostic, setSSHDiagnostic] = useState<connection.SSHDiagnostic>();
  const [groups, setGroups] = useState<TabGroup[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [connectDialog, setConnectDialog] = useState<ConnectDialogState>(null);
  const [rdpDialog, setRdpDialog] = useState<{ key: number; initial?: Partial<RDPProfile> } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const [recordingsOpen, setRecordingsOpen] = useState(false);
  const [streamDialog, setStreamDialog] = useState<StreamDialogState | null>(null);
  const [containersFor, setContainersFor] = useState<string | null>(null);
  const [installKeyFor, setInstallKeyFor] = useState<string | null>(null);
  const broadcast = useBroadcast();
  const [settingsOpen, setSettingsOpen] = useState<SettingsSection | null>(null);
  const [sidebar, setSidebar] = useState<SidebarPref>(readSidebarPref);
  const [bulkHosts, setBulkHosts] = useState<HostItem[] | null>(null);
  const [inventoriesOpen, setInventoriesOpen] = useState(false);
  const library = useHostLibrary({
    connectSSH: (p) => handleProfileConnect(p),
    editSSH: (p) => openConnectDialog(null, p),
    newSSH: (folderId) => openConnectDialog(null, { folderId }),
    editRDP: (p) => openRdpDialog(p),
    connectRDP: (p, external) => handleConnectRDP(p, external),
    newRDP: (folderId) => openRdpDialog({ folderId }),
    connectStream: (p) => openStream(p),
    editStream: (p) => setStreamDialog({ kind: p.kind, profile: p }),
    newStream: (folderId) => setStreamDialog({ kind: 'telnet', profile: { folderId } }),
    openMany: (list, split) => openMany(list, split),
    bulkEdit: (list) => setBulkHosts(list),
    openInventories: () => setInventoriesOpen(true),
  });

  const notesOf = (kind: string, id: string | undefined) => {
    const m = id ? library.meta.get(`${kind}:${id}`) : undefined;
    return { tags: m?.tags ?? [], notes: m?.notes ?? '' };
  };

  /** Remembers that a saved host was opened, for the Recent list. */
  const touchHost = (kind: 'ssh' | 'rdp' | 'stream', id: string | undefined) => {
    if (!id) return;
    const saved =
      kind === 'ssh' ? library.ssh.some((p) => p.id === id) : kind === 'rdp' ? library.rdp.some((p) => p.id === id) : library.streams.some((p) => p.id === id);
    if (!saved) return;
    library.touched(kind, id);
    TouchHost(kind, id).catch(() => {});
  };
  const sshProfiles = library.ssh;
  const rdpProfiles = library.rdp;
  const streamProfiles = library.streams;
  const loadProfiles = library.reload;
  const [sftpOpenFor, setSftpOpenFor] = useState<Record<string, boolean>>({});
  const [sizes, setSizes] = useState<Record<string, { cols: number; rows: number }>>({});
  const dialogKey = useRef(0);
  const lock = useAppLock();
  const masking = useSettings().security.masking.enabled;

  useEffect(() => {
    const onChanged = () => void loadProfiles();
    window.addEventListener('terminyxx:library-changed', onChanged);
    return () => window.removeEventListener('terminyxx:library-changed', onChanged);
  }, [loadProfiles]);

  useEffect(() => {
    setClipboardNotifier((s) => dialogs.toast(`Copied. The clipboard will be cleared in ${s} s.`));
    return () => setClipboardNotifier(null);
  }, [dialogs]);

  // Startup update check: quiet unless a newer release exists.
  useEffect(() => {
    loadVersion();
    if (!getSettings().updates.autoCheck) return;
    const t = window.setTimeout(() => {
      void checkForUpdate().then((u) => {
        if (u.result?.available) dialogs.toast(`Terminyxx ${u.result.latest} is available. See Settings → About.`, 'info');
      });
    }, 3000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lockApp = async () => {
    if (await lockNow()) return;
    dialogs.toast('Set a master password in Settings → Security to lock Terminyxx.');
    setSettingsOpen('security');
  };
  const toggleMasking = () => {
    const on = !getSettings().security.masking.enabled;
    updateSecurity('masking', { enabled: on });
    dialogs.toast(on ? 'Secrets in terminal output are now masked' : 'Secret masking is off', on ? 'success' : 'info');
  };

  // macOS: Cmd+L locks too (Cmd shortcuts never reach the shell there).
  useEffect(() => {
    if (platform !== 'darwin' || lock.locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyL') {
        e.preventDefault();
        e.stopPropagation();
        void lockApp();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, lock.locked]);

  // Tabs keep the profile they connected with; show the host's current color tag.
  const shownTabs = useMemo(
    () =>
      tabs.map((t) => {
        const saved = t.profile && sshProfiles.find((p) => p.id === t.profile!.id);
        return saved && saved.options !== t.profile!.options ? { ...t, profile: { ...t.profile!, options: saved.options } } : t;
      }),
    [tabs, sshProfiles]
  );
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const activeGroup = groups.find((g) => activeTabId && contains(g.root, activeTabId)) ?? null;
  const isSplit = !!activeGroup && activeGroup.root.kind === 'split';
  const groupPanes = useMemo(() => (activeGroup ? paneIds(activeGroup.root) : []), [activeGroup]);
  useEffect(() => {
    setBroadcastPanes(groupPanes);
  }, [groupPanes]);

  // Remember the focused pane per tab, so switching tabs restores it.
  useEffect(() => {
    if (!activeTabId) return;
    setGroups((prev) =>
      prev.some((g) => g.focus !== activeTabId && contains(g.root, activeTabId))
        ? prev.map((g) => (contains(g.root, activeTabId) ? { ...g, focus: activeTabId } : g))
        : prev
    );
  }, [activeTabId]);
  const sftpOpen = !!(activeTab && activeTab.status === 'connected' && !activeTab.profile?.sftpOnly && sftpOpenFor[activeTab.id]);
  const connectedProfileIds = useMemo(
    () =>
      new Set(
        tabs
          .filter((t) => t.status === 'connected')
          .map((t) => t.profile?.id ?? t.stream?.id)
          .filter((id): id is string => !!id)
      ),
    [tabs]
  );

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, JSON.stringify(sidebar));
    } catch {
      // storage unavailable
    }
  }, [sidebar]);
  const toggleRail = () => setSidebar((s) => ({ ...s, rail: !s.rail }));

  const patchTab = useCallback((id: string, patch: Partial<TerminalTab>) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  // Track backend connection state (drops, `exit`, keepalive timeouts).
  const tabIds = tabs.map((t) => t.id).join(',');
  useEffect(() => {
    const offs = tabIds
      .split(',')
      .filter(Boolean)
      .map((id) =>
        EventsOn(`connection:state:${id}`, (state: string, reason?: string) => {
          if (state === 'disconnected') {
            // A dropped SSH connection (not `exit`, not a click) reconnects on its own.
            const retry = reason === 'lost' && getSettings().sessions.autoReconnect;
            setTabs((prev) =>
              prev.map((t) =>
                t.id === id && t.status === 'connected'
                  ? { ...t, status: 'disconnected', retry: retry && t.profile && !t.stream && !t.rdp ? { attempt: 1, at: Date.now() + retryDelay(1) } : undefined }
                  : t
              )
            );
          }
        })
      );
    return () => offs.forEach((off) => off());
  }, [tabIds]);

  /** Creates a session; with `place` it opens as a split next to that pane. */
  const newTab = (title = 'New tab', host = '', place?: { target: string; side: Side }): string => {
    const id = crypto.randomUUID();
    setTabs((prev) => [...prev, { id, title, host, status: 'idle', started: false }]);
    setGroups((prev) => {
      if (place && prev.some((g) => contains(g.root, place.target))) {
        return prev.map((g) => (contains(g.root, place.target) ? { ...g, root: insertPane(g.root, place.target, id, place.side), focus: id } : g));
      }
      return [...prev, { id: crypto.randomUUID(), root: { kind: 'pane', id }, focus: id }];
    });
    setActiveTabId(id);
    return id;
  };

  const connectTab = async (tabId: string, profile: SSHProfile, container?: connection.Container) => {
    const title = container ? `${container.name} · ${profile.name}` : profile.name;
    patchTab(tabId, { status: 'connecting', title, host: profile.host, profile, container, sshDiagnostic: undefined });
    try {
      const res = await connectWithPrompts(tabId, profile, dialogs, { container });
      let tabProfile = profile;
      if (res.allowedLegacy) {
        tabProfile = { ...tabProfile, allowLegacyAlgorithms: true };
        const saved = sshProfiles.find((p) => p.id === profile.id);
        if (saved) {
          SaveSSHProfile(sshForSave({ ...saved, password: '', allowLegacyAlgorithms: true }))
            .then(loadProfiles)
            .catch(() => {});
        }
      }
      if (res.typedPassword !== undefined) {
        const saved = sshProfiles.find((p) => p.id === profile.id);
        if (res.rememberPassword && saved) {
          try {
            const ident = identityById(saved.identityId);
            // A host that uses an identity keeps its password in the identity.
            if (ident) await saveIdentity({ ...ident, password: res.typedPassword });
            else await SaveSSHProfile(sshForSave({ ...saved, password: res.typedPassword }));
            tabProfile = { ...tabProfile, password: '', hasPassword: true };
            loadProfiles();
          } catch (err) {
            dialogs.toast(`Password not saved: ${errorText(err)}`, 'error');
          }
        } else {
          // Keep it in memory so Reconnect works for this session.
          tabProfile = { ...tabProfile, password: res.typedPassword };
        }
      }
      patchTab(tabId, { status: 'connected', started: true, profile: tabProfile });
      touchHost('ssh', profile.id);
    } catch (err) {
      const sshDiagnostic = err instanceof SSHConnectFailure ? err.diagnostic : undefined;
      setTabs((prev) => prev.map((t) =>
        t.id === tabId ? { ...t, status: t.started ? 'disconnected' : 'idle', sshDiagnostic } : t
      ));
      if (!(err instanceof ConnectCancelled)) {
        dialogs.toast(`Could not connect to ${profile.host}: ${errorText(err)}`, 'error');
      }
    }
  };

  // --- automatic reconnect ---

  const tabsRef = useRef(tabs);
  const rdpConnections = useRef(new Map<string, { id: string; controller: AbortController }>());
  tabsRef.current = tabs;

  const autoReconnect = async (id: string) => {
    const tab = tabsRef.current.find((t) => t.id === id);
    if (!tab?.retry || tab.status !== 'disconnected' || !tab.profile) return;
    const { attempt } = tab.retry;
    // Use the saved host as it is now (its login may have changed meanwhile);
    // keep a password typed for this session.
    const saved = sshProfiles.find((p) => p.id === tab.profile!.id);
    const profile = saved ? { ...saved, password: tab.profile.password } : tab.profile;
    patchTab(id, { status: 'connecting', sshDiagnostic: undefined });
    try {
      await connectWithPrompts(id, profile, dialogs, { interactive: false, container: tab.container });
      patchTab(id, { status: 'connected', started: true, retry: undefined });
      dialogs.toast(`Reconnected to ${tab.title}`, 'success');
    } catch (err) {
      if (!tabsRef.current.some((t) => t.id === id && t.retry)) return; // closed or cancelled meanwhile
      const sshDiagnostic = err instanceof SSHConnectFailure ? err.diagnostic : undefined;
      if (err instanceof ConnectNeedsUser) {
        patchTab(id, { status: 'disconnected', retry: undefined, sshDiagnostic });
        dialogs.toast(`Could not reconnect to ${tab.title} automatically: ${err.message}. Use Reconnect.`, 'error');
      } else if (err instanceof ConnectCancelled) {
        // App locked: try again later without using up an attempt.
        patchTab(id, { status: 'disconnected', retry: { attempt, at: Date.now() + retryDelay(attempt) } });
      } else if (attempt >= RETRY_MAX) {
        patchTab(id, { status: 'disconnected', retry: undefined, sshDiagnostic });
        dialogs.toast(`Gave up reconnecting to ${tab.title}: ${errorText(err)}`, 'error');
      } else {
        patchTab(id, { status: 'disconnected', retry: { attempt: attempt + 1, at: Date.now() + retryDelay(attempt + 1) } });
      }
    }
  };

  const retryKey = tabs
    .filter((t) => t.retry && t.status === 'disconnected')
    .map((t) => `${t.id}:${t.retry!.at}`)
    .join(',');
  useEffect(() => {
    if (!retryKey || lock.locked) return;
    const timers = retryKey.split(',').map((entry) => {
      const [id, at] = entry.split(':');
      return window.setTimeout(() => void autoReconnect(id), Math.max(0, Number(at) - Date.now()));
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey, lock.locked]);

  // The network is back (Wi-Fi, VPN, wake from sleep): try right away.
  useEffect(() => {
    const onOnline = () =>
      setTabs((prev) => prev.map((t) => (t.retry && t.status === 'disconnected' ? { ...t, retry: { ...t.retry, at: Date.now() } } : t)));
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  const cancelRetry = (id: string) => patchTab(id, { retry: undefined });

  // --- workspaces and session restore ---

  const workspaces = useWorkspaces();
  const savedIds = useMemo(
    () => new Set([...sshProfiles.map((p) => p.id), ...rdpProfiles.map((p) => p.id), ...streamProfiles.map((p) => p.id)]),
    [sshProfiles, rdpProfiles, streamProfiles]
  );
  const restored = useRef(false);

  const openWorkspace = async (ws: Workspace) => {
    const exists = (p: { kind: string; profileId: string }) =>
      p.kind === 'ssh'
        ? sshProfiles.some((x) => x.id === p.profileId)
        : p.kind === 'stream'
          ? streamProfiles.some((x) => x.id === p.profileId)
          : getSettings().rdp.builtin && rdpProfiles.some((x) => x.id === p.profileId);
    const inst = instantiate(prune(ws, exists));
    if (inst.groups.length === 0) {
      dialogs.toast(`The hosts of “${ws.name}” no longer exist.`, 'error');
      return;
    }
    const opened = inst.panes.map(({ id, pane }) => {
      const ssh = pane.kind === 'ssh' ? sshProfiles.find((x) => x.id === pane.profileId) : undefined;
      const rdp = pane.kind === 'rdp' ? rdpProfiles.find((x) => x.id === pane.profileId) : undefined;
      const stream = pane.kind === 'stream' ? streamProfiles.find((x) => x.id === pane.profileId) : undefined;
      const tab: TerminalTab = stream
        ? { id, title: streamTitle(stream), host: streamHost(stream), status: 'idle', started: false, stream }
        : { id, title: (ssh ?? rdp)!.name, host: (ssh ?? rdp)!.host, status: 'idle', started: false, profile: ssh, rdp };
      return { tab, ssh, rdp, stream };
    });
    setTabs((prev) => [...prev, ...opened.map((o) => o.tab)]);
    setGroups((prev) => [...prev, ...inst.groups]);
    setActiveTabId(inst.active);
    // One at a time, so host key or password questions don't pile up.
    for (const o of opened) {
      await new Promise((res) => window.setTimeout(res, 0)); // let the new tabs render first
      if (!tabsRef.current.some((t) => t.id === o.tab.id)) continue; // closed meanwhile
      if (o.ssh) await connectTab(o.tab.id, o.ssh);
      else if (o.rdp) await connectRdp(o.tab.id, o.rdp);
      else if (o.stream) await connectStream(o.tab.id, o.stream);
    }
  };

  // Once the hosts are loaded (after unlocking): read workspaces, reopen the last session.
  useEffect(() => {
    if (!library.loaded || restored.current) return;
    void loadWorkspaces();
    void reloadIdentities();
    void pruneRecordings().catch(() => {}); // settings.recordings; a failure is retried next start
    if (!getSettings().sessions.restore) {
      restored.current = true;
      return;
    }
    void loadLastSession().then((ws) => {
      restored.current = true;
      if (ws) void openWorkspace(ws);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library.loaded]);

  const restoreOn = useSettings().sessions.restore;
  const layoutKey = JSON.stringify([groups, tabs.map((t) => [t.id, t.profile?.id, t.rdp?.id, t.stream?.id]), activeTabId]);
  useEffect(() => {
    if (!restored.current) return;
    rememberSession(restoreOn ? snapshot('Last session', groups, tabs, activeTabId, savedIds) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, restoreOn, savedIds]);

  /** Opens hosts from the sidebar: a tab each, or panes of one tab (up to 9 per tab). */
  const openMany = (list: HostItem[], split: boolean) => {
    const builtin = getSettings().rdp.builtin;
    for (const h of list) if (h.kind === 'rdp' && !builtin) void handleConnectRDP(h.profile);
    const usable = list.filter((h) => h.kind !== 'rdp' || builtin);
    if (usable.length === 0) return;
    const panes: Record<string, WorkspacePane> = {};
    const ids = usable.map((h, i) => {
      panes[`p${i}`] = { kind: h.kind, profileId: h.id };
      return `p${i}`;
    });
    const groups: Workspace['groups'] = [];
    if (split) {
      for (let i = 0; i < ids.length; i += 9) {
        const chunk = ids.slice(i, i + 9);
        groups.push({ root: gridLayout(chunk), focus: chunk[0] });
      }
    } else {
      for (const id of ids) groups.push({ root: { kind: 'pane', id }, focus: id });
    }
    void openWorkspace({ id: '', name: 'Hosts', groups, panes, active: groups.length - 1 });
  };

  const saveAsWorkspace = async (groupIds?: string[]) => {
    const g = groupIds ? groups.find((x) => x.id === groupIds[0]) : undefined;
    const first = tabs.find((t) => t.id === (g?.focus ?? activeTabId));
    const name = await dialogs.prompt({
      title: groupIds ? 'Save tab as workspace' : 'Save tabs as workspace',
      label: 'Workspace name (an existing one with this name is replaced):',
      defaultValue: first?.title ?? '',
      confirmLabel: 'Save',
    });
    if (!name?.trim()) return;
    const ws = snapshot(name.trim(), groups, tabs, activeTabId, savedIds, groupIds);
    if (!ws) {
      dialogs.toast('Only saved hosts can be part of a workspace. Save the host first.', 'error');
      return;
    }
    try {
      await saveWorkspace(ws);
      dialogs.toast(`Saved workspace “${ws.name}”`, 'success');
    } catch (err) {
      dialogs.toast(`Workspace not saved: ${errorText(err)}`, 'error');
    }
  };

  const removeWorkspace = async (ws: Workspace) => {
    const ok = await dialogs.confirm({ title: 'Delete workspace', message: `Delete the workspace “${ws.name}”? The hosts in it are kept.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      await deleteWorkspace(ws.id);
    } catch (err) {
      dialogs.toast(`Could not delete: ${errorText(err)}`, 'error');
    }
  };

  function openConnectDialog(tabId: string | null, initial?: Partial<SSHProfile>) {
    dialogKey.current += 1;
    setConnectDialog({ key: dialogKey.current, tabId, initial });
  }

  function openRdpDialog(initial?: Partial<RDPProfile>) {
    dialogKey.current += 1;
    setRdpDialog({ key: dialogKey.current, initial });
  }

  const quickConnect = (target: QuickTarget) => {
    const existing = sshProfiles.find(
      (p) => p.host === target.host && p.port === target.port && (!target.username || p.username === target.username)
    );
    if (existing) return handleProfileConnect(existing);
    openConnectDialog(null, { host: target.host, port: target.port, username: target.username });
  };

  const handleDialogConnect = async (profile: SSHProfile, save: boolean, connect: boolean) => {
    if (!connect) {
      setConnectDialog(null);
      try {
        await SaveSSHProfile(sshForSave(profile));
        dialogs.toast(`Saved ${profile.name}`, 'success');
      } catch (err) {
        dialogs.toast(`Profile not saved: ${errorText(err)}`, 'error');
      }
      await loadProfiles();
      return;
    }
    const target = connectDialog?.tabId;
    const tab = tabs.find((t) => t.id === target);
    // Reuse an idle tab; otherwise open a new one.
    const tabId =
      tab && tab.status !== 'connected' && tab.status !== 'connecting' ? tab.id : newTab(profile.name, profile.host);
    setConnectDialog(null);
    if (save) {
      try {
        await SaveSSHProfile(sshForSave(profile));
        await loadProfiles();
      } catch (err) {
        dialogs.toast(`Profile not saved: ${errorText(err)}`, 'error');
      }
    }
    await connectTab(tabId, profile);
  };

  const stopRdp = (tabId: string) => {
    const connection = rdpConnections.current.get(tabId);
    if (!connection) return;
    rdpConnections.current.delete(tabId);
    connection.controller.abort();
    void RDPClose(connection.id).catch(() => {});
  };

  const handleDisconnect = async (id: string) => {
    if (rdpConnections.current.has(id) || tabs.find((t) => t.id === id)?.rdp) {
      stopRdp(id);
      patchTab(id, { status: 'disconnected', rdpSession: undefined });
      return;
    }
    try {
      await SSHDisconnect(id);
    } catch {
      // already gone
    }
    patchTab(id, { status: 'disconnected', retry: undefined });
  };

  const connectStream = async (tabId: string, spec: StreamSpec): Promise<boolean> => {
    patchTab(tabId, { status: 'connecting', title: streamTitle(spec), host: streamHost(spec), stream: spec, profile: undefined });
    try {
      // spec.id is the saved profile's; the connection is keyed by the tab.
      await StreamConnect(connection.StreamRequest.createFrom({ ...spec, id: tabId }));
      patchTab(tabId, { status: 'connected', started: true });
      touchHost('stream', spec.id);
      return true;
    } catch (err) {
      setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, status: t.started ? 'disconnected' : 'idle' } : t)));
      dialogs.toast(`Could not connect: ${errorText(err)}`, 'error');
      return false;
    }
  };

  const openStream = (spec: StreamSpec) => {
    const id = newTab(streamTitle(spec), streamHost(spec));
    void connectStream(id, spec);
  };

  const saveStream = async (p: StreamProfile, connect: boolean) => {
    try {
      await SaveStreamProfile(streamForSave(p));
    } catch (err) {
      dialogs.toast(`Could not save: ${errorText(err)}`, 'error');
      return;
    }
    setStreamDialog(null);
    await loadProfiles();
    if (connect) openStream(p);
  };

  const openExec = (tab: TerminalTab, c: connection.Container) => {
    if (!tab.profile) return;
    setContainersFor(null);
    const id = newTab(c.name, tab.host, { target: tab.id, side: 'right' });
    void connectTab(id, tab.profile, c);
  };

  const handleReconnect = (tab: TerminalTab) => {
    if (tab.retry) patchTab(tab.id, { retry: undefined });
    if (tab.rdp) void connectRdp(tab.id, tab.rdp);
    else if (tab.stream) void connectStream(tab.id, tab.stream);
    else if (tab.profile) void connectTab(tab.id, tab.profile, tab.container);
    else openConnectDialog(tab.id);
  };

  /** Closes sessions (panes); tabs left without panes disappear. */
  const closeSessions = (ids: string[]) => {
    if (ids.length === 0) return;
    for (const id of ids) {
      const tab = tabs.find((t) => t.id === id);
      if (rdpConnections.current.has(id) || tab?.rdp) stopRdp(id);
      else if (tab && (tab.status === 'connected' || tab.status === 'connecting')) SSHDisconnect(id).catch(() => {});
    }
    setTabs((prev) => prev.filter((t) => !ids.includes(t.id)));
    setSftpOpenFor((s) => {
      const n = { ...s };
      ids.forEach((id) => delete n[id]);
      return n;
    });

    let nextActive = activeTabId;
    const nextGroups: TabGroup[] = [];
    groups.forEach((g) => {
      let root: TabGroup['root'] | null = g.root;
      let focus = g.focus;
      for (const id of ids) {
        if (!root || !contains(root, id)) continue;
        // Focus moves to a neighbour of the closed pane.
        const r: TabGroup['root'] = root;
        const near = (['left', 'top', 'right', 'bottom'] as Side[]).map((s) => neighbor(r, id, s)).find((n) => n && !ids.includes(n));
        root = removePane(root, id);
        if (root && focus === id) focus = near && contains(root, near) ? near : paneIds(root)[0];
      }
      if (root) nextGroups.push({ ...g, root, focus });
    });
    if (activeTabId && ids.includes(activeTabId)) {
      const gi = groups.findIndex((g) => contains(g.root, activeTabId));
      const same = nextGroups.find((g) => g.id === groups[gi]?.id);
      if (same) nextActive = same.focus;
      else {
        // The whole tab closed: go to the tab that takes its place.
        const before = groups.slice(0, gi).filter((g) => nextGroups.some((n) => n.id === g.id)).length;
        const next = nextGroups[Math.min(before, nextGroups.length - 1)];
        nextActive = next ? next.focus : null;
      }
    }
    setGroups(nextGroups);
    if (nextActive !== activeTabId) setActiveTabId(nextActive);
  };
  const handleCloseTab = (id: string) => closeSessions([id]);
  const closeGroup = (groupId: string) => {
    const g = groups.find((x) => x.id === groupId);
    if (g) closeSessions(paneIds(g.root));
  };

  /** Moves an open session next to `target`, or into its own tab when target is null. */
  const movePane = (id: string, target: string | null, side: Side) => {
    if (id === target) return;
    setGroups((prev) => {
      const sourceIdx = prev.findIndex((g) => contains(g.root, id));
      const without = prev.flatMap((g) => {
        if (!contains(g.root, id)) return [g];
        const root = removePane(g.root, id);
        return root ? [{ ...g, root, focus: g.focus === id ? paneIds(root)[0] : g.focus }] : [];
      });
      if (target && without.some((g) => contains(g.root, target))) {
        return without.map((g) => (contains(g.root, target) ? { ...g, root: insertPane(g.root, target, id, side), focus: id } : g));
      }
      const own: TabGroup = { id: crypto.randomUUID(), root: { kind: 'pane', id }, focus: id };
      const at = Math.min(Math.max(sourceIdx + 1, 0), without.length);
      return [...without.slice(0, at), own, ...without.slice(at)];
    });
    setActiveTabId(id);
  };
  const detachPane = (id: string) => {
    const g = groups.find((x) => contains(x.root, id));
    if (g && g.root.kind === 'split') movePane(id, null, 'right');
  };

  /** Opens a new pane next to `target`: the same host again, or a connect dialog. */
  const splitPane = (target: string | null, side: Side) => {
    const tab = tabs.find((t) => t.id === target);
    if (!tab) return;
    if (tab.profile) {
      const id = newTab(tab.profile.name, tab.profile.host, { target: tab.id, side });
      connectTab(id, tab.profile);
    } else if (tab.rdp) {
      const id = newTab(tab.rdp.name, tab.rdp.host, { target: tab.id, side });
      void connectRdp(id, tab.rdp);
    } else {
      const id = newTab('New tab', '', { target: tab.id, side });
      openConnectDialog(id);
    }
  };

  const handlePaneDrop = (drag: PaneDrag, target: string | null, side: Side) => {
    if (drag.kind === 'session') {
      movePane(drag.id, target, side);
      return;
    }
    const id = newTab(drag.profile.name, drag.profile.host, target ? { target, side } : undefined);
    connectTab(id, drag.profile);
  };

  const focusNeighbor = (side: Side) => {
    if (!activeGroup || !activeTabId) return;
    const n = neighbor(activeGroup.root, activeTabId, side);
    if (n) setActiveTabId(n);
  };

  const paneEntries = (id: string): MenuEntry[] => {
    const inSplit = groups.find((g) => contains(g.root, id))?.root.kind === 'split';
    return [
      { label: 'Split right', icon: <Columns2 size={13} />, hint: `${mod}+⇧+D`, onSelect: () => splitPane(id, 'right') },
      { label: 'Split down', icon: <Rows2 size={13} />, hint: `${mod}+⇧+E`, onSelect: () => splitPane(id, 'bottom') },
      ...(inSplit ? [{ label: 'Move to new tab', icon: <SquareArrowOutUpRight size={13} />, onSelect: () => detachPane(id) } as MenuEntry] : []),
    ];
  };
  const tabMenu = (e: React.MouseEvent, id: string) => {
    const g = groups.find((x) => contains(x.root, id));
    const many = !!g && g.root.kind === 'split';
    openMenu(e, [
      ...paneEntries(id),
      { type: 'separator' },
      ...(g ? [{ label: 'Save tab as workspace…', icon: <LayoutGrid size={13} />, onSelect: () => void saveAsWorkspace([g.id]) } as MenuEntry] : []),
      { label: many ? 'Close pane' : 'Close tab', icon: <X size={13} />, hint: `${mod}+⇧+W`, onSelect: () => handleCloseTab(id) },
      ...(many ? [{ label: 'Close all panes in tab', icon: <X size={13} />, danger: true, onSelect: () => closeGroup(g!.id) } as MenuEntry] : []),
    ]);
  };

  function handleProfileConnect(profile: SSHProfile) {
    const id = newTab(profile.name, profile.host);
    connectTab(id, profile);
  }

  /** Opens an RDP host in a tab, or in the system's client (setting or `external`). */
  const handleConnectRDP = async (profile: RDPProfile, external = false) => {
    if (external || !getSettings().rdp.builtin) {
      try {
        await LaunchRDP(profile.id);
        touchHost('rdp', profile.id);
      } catch (err) {
        dialogs.toast(`Failed to launch RDP: ${errorText(err)}`, 'error');
      }
      return;
    }
    const id = newTab(profile.name, profile.host);
    await connectRdp(id, profile);
  };

  /** Gets a session ticket for an RDP tab; the RdpPane then connects with it. */
  const connectRdp = async (tabId: string, profile: RDPProfile, password = '') => {
    stopRdp(tabId);
    const connection = { id: crypto.randomUUID(), controller: new AbortController() };
    const { signal } = connection.controller;
    rdpConnections.current.set(tabId, connection);
    patchTab(tabId, { status: 'connecting', title: profile.name, host: profile.host, rdp: profile, rdpSession: undefined, profile: undefined, stream: undefined });
    try {
      const session = await openRdpSession(connection.id, profile, dialogs, password, signal);
      if (signal.aborted) return;
      patchTab(tabId, { started: true, rdpSession: Object.assign(session, { connectionId: connection.id }) });
      touchHost('rdp', profile.id);
    } catch (err) {
      if (signal.aborted) return;
      stopRdp(tabId);
      setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, status: t.started ? 'disconnected' : 'idle' } : t)));
      if (!(err instanceof ConnectCancelled)) dialogs.toast(`Could not connect to ${profile.host}: ${errorText(err)}`, 'error');
    } finally {
      // A close can reach Go before the open call finishes preparing.
      if (signal.aborted) void RDPClose(connection.id).catch(() => {});
    }
  };

  /** The RDP pane shown in real full screen (window full screen + pane over everything). */
  const [rdpFull, setRdpFull] = useState<string | null>(null);
  const enterRdpFullscreen = (id: string) => {
    setRdpFull(id);
    WindowFullscreen();
  };
  const exitRdpFullscreen = () => {
    setRdpFull(null);
    WindowUnfullscreen();
  };
  const toggleRdpFullscreen = () => {
    if (rdpFull) exitRdpFullscreen();
    else if (activeTab?.rdp && activeTab.status === 'connected') enterRdpFullscreen(activeTab.id);
  };
  // Leave full screen when its session ends or closes.
  useEffect(() => {
    if (!rdpFull) return;
    const tab = tabs.find((t) => t.id === rdpFull);
    if (!tab || tab.status !== 'connected') exitRdpFullscreen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rdpFull, tabs]);
  // The window can also leave full screen on its own (macOS green button,
  // Ctrl+Cmd+F, a Space switch): follow it.
  useEffect(() => {
    if (!rdpFull) return;
    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void WindowIsFullscreen().then((full) => {
          if (!full) setRdpFull(null);
        });
      }, 300);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.clearTimeout(timer);
    };
  }, [rdpFull]);

  const handleRdpEnded = async (tab: TerminalTab, connectionId: string, error: string | null, authFailed: boolean) => {
    if (rdpConnections.current.get(tab.id)?.id !== connectionId) return;
    stopRdp(tab.id);
    // Drop the spent ticket (and the password in it); a reconnect gets a new one.
    patchTab(tab.id, { status: 'disconnected', rdpSession: undefined });
    if (!error || !tab.rdp) return;
    if (authFailed) {
      const pw = await dialogs.prompt({
        title: 'Wrong password',
        label: `${error}. Password for ${tab.rdp.username ? `${tab.rdp.username}@` : ''}${tab.rdp.host}`,
        password: true,
        confirmLabel: 'Connect',
      });
      if (pw !== null && tabsRef.current.some((t) => t.id === tab.id) && !rdpConnections.current.has(tab.id)) {
        void connectRdp(tab.id, tab.rdp, pw);
      }
      return;
    }
    dialogs.toast(`RDP session with ${tab.rdp.host} ended: ${error}`, 'error');
  };

  const handleSaveRDP = async (profile: RDPProfile) => {
    try {
      await SaveRDPProfile(rdpForSave(profile));
    } catch (err) {
      dialogs.toast(`Profile not saved: ${errorText(err)}`, 'error');
    }
    await loadProfiles();
    setRdpDialog(null);
  };

  const toggleSftp = () => {
    if (activeTab?.status !== 'connected' || activeTab.stream || activeTab.rdp || activeTab.profile?.sftpOnly) return;
    setSftpOpenFor((s) => ({ ...s, [activeTab.id]: !s[activeTab.id] }));
  };

  const cycleTab = (dir: 1 | -1) => {
    if (groups.length < 2 || !activeGroup) return;
    const i = groups.indexOf(activeGroup);
    setActiveTabId(groups[(i + dir + groups.length) % groups.length].focus);
  };

  useHotkeys({
    'Ctrl+Shift+P': () => setPaletteOpen((v) => !v),
    'Ctrl+,': () => setSettingsOpen((v) => (v ? null : 'appearance')),
    'Ctrl+Shift+F': toggleSftp,
    'Ctrl+Shift+T': () => openConnectDialog(null),
    'Ctrl+Shift+W': () => activeTabId && handleCloseTab(activeTabId),
    'Ctrl+Shift+B': toggleRail,
    'Ctrl+Shift+]': () => cycleTab(1),
    'Ctrl+Shift+[': () => cycleTab(-1),
    'Ctrl+Shift+D': () => splitPane(activeTabId, 'right'),
    'Ctrl+Shift+E': () => splitPane(activeTabId, 'bottom'),
    'Ctrl+Shift+L': () => void lockApp(),
    'Ctrl+Shift+M': toggleMasking,
    'Ctrl+Shift+S': () => setSnippetsOpen((v) => !v),
    'Ctrl+Shift+G': toggleBroadcast,
    // Full screen for RDP panes; Ctrl+Alt+Enter is what other RDP clients use.
    'Ctrl+Alt+Enter': toggleRdpFullscreen,
    // Move focus between panes (only while split, so the shell keeps Alt+arrows otherwise).
    ...(isSplit
      ? {
          'Alt+Left': () => focusNeighbor('left'),
          'Alt+Right': () => focusNeighbor('right'),
          'Alt+Up': () => focusNeighbor('top'),
          'Alt+Down': () => focusNeighbor('bottom'),
        }
      : {}),
  }, !lock.locked);

  const tagWords = (kind: string, id: string) => {
    const m = library.meta.get(`${kind}:${id}`);
    return m ? `${m.tags.map((t) => `#${t}`).join(' ')} ${m.notes}` : '';
  };
  const recent = recentHosts(library.hosts, Math.max(5, getSettings().hosts.recentCount));
  const paletteItems: PaletteItem[] = [
    ...recent.map<PaletteItem>((h) => ({
      id: `recent:${h.kind}:${h.id}`,
      group: 'Recent',
      label: h.name,
      hint: h.detail,
      icon: <RotateCw size={14} />,
      emptyOnly: true,
      run: () => library.actions.openHost(h),
    })),
    ...sshProfiles.map<PaletteItem>((p) => ({
      id: `host:${p.id}`,
      group: 'Hosts',
      label: p.name,
      hint: [...folderPath(library.tree, p.folderId ?? ''), `${p.username}@${p.host}${p.port !== 22 ? ':' + p.port : ''}`].join(' / '),
      icon: <Server size={14} />,
      keywords: tagWords('ssh', p.id),
      run: () => handleProfileConnect(p),
    })),
    ...rdpProfiles.map<PaletteItem>((p) => ({
      id: `rdp:${p.id}`,
      group: 'Hosts',
      label: p.name,
      hint: `RDP · ${p.host}`,
      icon: <Monitor size={14} />,
      keywords: tagWords('rdp', p.id),
      run: () => handleConnectRDP(p),
    })),
    ...streamProfiles.map<PaletteItem>((p) => ({
      id: `stream:${p.id}`,
      group: 'Hosts',
      label: p.name,
      hint: [...folderPath(library.tree, p.folderId ?? ''), streamDetail(p)].join(' / '),
      icon: p.kind === 'serial' ? <Cable size={14} /> : <Network size={14} />,
      keywords: `${p.kind === 'serial' ? 'serial com console' : 'telnet'} ${tagWords('stream', p.id)}`,
      run: () => openStream(p),
    })),
    ...tabs.map<PaletteItem>((t) => ({
      id: `tab:${t.id}`,
      group: 'Tabs',
      label: `Go to ${t.title}`,
      hint: t.host,
      icon: <SquareTerminal size={14} />,
      run: () => setActiveTabId(t.id),
    })),
    ...workspaces.map<PaletteItem>((w) => ({
      id: `ws:${w.id}`,
      group: 'Workspaces',
      label: `Open workspace ${w.name}`,
      hint: `${w.groups.length} tab${w.groups.length === 1 ? '' : 's'}`,
      icon: <LayoutGrid size={14} />,
      keywords: 'workspace layout session',
      run: () => void openWorkspace(w),
    })),
    ...(groups.length > 0
      ? [{ id: 'ws-save', group: 'Actions', label: 'Save open tabs as workspace…', icon: <LayoutGrid size={14} />, keywords: 'workspace layout session save', run: () => void saveAsWorkspace() } as PaletteItem]
      : []),
    ...(activeTab?.status === 'connected' && activeTab.profile
      ? [{ id: 'install-key', group: 'Actions', label: 'Install SSH public key on this server', icon: <SquareTerminal size={14} />, keywords: 'ssh-copy-id authorized_keys key login passwordless', run: () => setInstallKeyFor(activeTab.id) } as PaletteItem]
      : []),
    { id: 'keys', group: 'Actions', label: 'SSH keys (generate, agent)', icon: <Settings size={14} />, keywords: 'ssh-keygen ed25519 key agent ssh-add public', run: () => setSettingsOpen('keys') },
    { id: 'identities', group: 'Actions', label: 'Identities (shared logins)', icon: <Settings size={14} />, keywords: 'credentials user password key login account', run: () => setSettingsOpen('identities') },
    { id: 'new', group: 'Actions', label: 'New SSH connection', icon: <Plus size={14} />, shortcut: [mod, '⇧', 'T'], run: () => openConnectDialog(null) },
    { id: 'rdp', group: 'Actions', label: 'New RDP profile', icon: <Monitor size={14} />, run: () => openRdpDialog() },
    { id: 'folder', group: 'Actions', label: 'New folder', icon: <FolderPlus size={14} />, run: () => library.newFolder('') },
    { id: 'import', group: 'Actions', label: 'Import hosts from another app', icon: <Upload size={14} />, keywords: 'openssh ssh config mobaxterm putty kitty winscp securecrt tabby termius filezilla rdp migrate', run: () => library.setImportOpen(true) },
    { id: 'settings', group: 'Actions', label: 'Settings', icon: <Settings size={14} />, keywords: 'preferences options config', shortcut: [mod, ','], run: () => setSettingsOpen('appearance') },
    { id: 'theme', group: 'Actions', label: 'Change terminal theme', icon: <Settings size={14} />, keywords: 'color scheme appearance font', run: () => setSettingsOpen('appearance') },
    { id: 'highlight', group: 'Actions', label: 'Highlighting rules', icon: <Settings size={14} />, keywords: 'keyword syntax highlight color error warning', run: () => setSettingsOpen('highlight') },
    { id: 'security', group: 'Actions', label: 'Security settings', icon: <ShieldCheck size={14} />, keywords: 'security hide screen share capture zoom teams privacy lock password clipboard paste algorithms agent', run: () => setSettingsOpen('security') },
    { id: 'lock', group: 'Actions', label: 'Lock Terminyxx', icon: <Lock size={14} />, keywords: 'lock away privacy master password', shortcut: [mod, '⇧', 'L'], run: () => void lockApp() },
    { id: 'mask', group: 'Actions', label: masking ? 'Stop masking secrets' : 'Mask secrets in terminal output', icon: <EyeOff size={14} />, keywords: 'presentation streamer mode hide password token redact', shortcut: [mod, '⇧', 'M'], run: toggleMasking },
    { id: 'trusted', group: 'Actions', label: 'Trusted hosts (known_hosts)', icon: <ShieldCheck size={14} />, keywords: 'host key fingerprint known_hosts revoke', run: () => setSettingsOpen('security') },
    { id: 'sync', group: 'Actions', label: 'Encrypted sync file (export / import hosts)', icon: <Settings size={14} />, keywords: 'backup restore transfer migrate cloud dropbox', run: () => setSettingsOpen('sync') },
    { id: 'telnet', group: 'Actions', label: 'New Telnet connection', icon: <Plus size={14} />, keywords: 'router switch network device', run: () => setStreamDialog({ kind: 'telnet' }) },
    { id: 'serial', group: 'Actions', label: 'New serial port connection', icon: <Plus size={14} />, keywords: 'com uart console usb tty baud', run: () => setStreamDialog({ kind: 'serial' }) },
    ...(activeTab?.status === 'connected' && activeTab.profile && !activeTab.profile.sftpOnly
      ? [{ id: 'containers', group: 'Actions', label: 'Containers (Docker, Podman, Kubernetes)', icon: <SquareTerminal size={14} />, keywords: 'docker exec shell pod kubectl podman', run: () => setContainersFor(activeTab.id) } as PaletteItem]
      : []),
    { id: 'recordings', group: 'Actions', label: 'Session recordings', icon: <Circle size={14} />, keywords: 'record replay playback history log search asciinema', run: () => setRecordingsOpen(true) },
    { id: 'snippets', group: 'Actions', label: 'Snippets', icon: <ScrollText size={14} />, keywords: 'commands macros saved scripts run', shortcut: [mod, '⇧', 'S'], run: () => setSnippetsOpen(true) },
    ...(isSplit
      ? [{ id: 'broadcast', group: 'Actions', label: broadcast.enabled ? 'Stop typing in all panes' : 'Type in all panes', icon: <Copy size={14} />, keywords: 'broadcast multi input sync panes', shortcut: [mod, '⇧', 'G'], run: toggleBroadcast } as PaletteItem]
      : []),
    { id: 'sidebar', group: 'Actions', label: sidebar.rail ? 'Expand sidebar' : 'Collapse sidebar', icon: <PanelLeft size={14} />, shortcut: [mod, '⇧', 'B'], run: toggleRail },
    ...(activeTab?.status === 'connected'
      ? [
          ...(activeTab.profile?.sftpOnly
            ? []
            : [{ id: 'sftp', group: 'Actions', label: sftpOpen ? 'Hide SFTP panel' : 'Show SFTP panel', icon: <FolderTree size={14} />, shortcut: [mod, '⇧', 'F'], run: toggleSftp } as PaletteItem]),
          { id: 'disc', group: 'Actions', label: `Disconnect ${activeTab.title}`, icon: <Unplug size={14} />, run: () => handleDisconnect(activeTab.id) } as PaletteItem,
        ]
      : []),
    ...(activeTab && activeTab.status === 'disconnected'
      ? [{ id: 'recon', group: 'Actions', label: `Reconnect ${activeTab.title}`, icon: <RotateCw size={14} />, run: () => handleReconnect(activeTab) } as PaletteItem]
      : []),
    ...(activeTab
      ? [
          { id: 'split-r', group: 'Actions', label: 'Split right', icon: <Columns2 size={14} />, keywords: 'pane vertical side by side', shortcut: [mod, '⇧', 'D'], run: () => splitPane(activeTab.id, 'right') } as PaletteItem,
          { id: 'split-d', group: 'Actions', label: 'Split down', icon: <Rows2 size={14} />, keywords: 'pane horizontal', shortcut: [mod, '⇧', 'E'], run: () => splitPane(activeTab.id, 'bottom') } as PaletteItem,
          ...(isSplit ? [{ id: 'detach', group: 'Actions', label: 'Move pane to new tab', icon: <SquareArrowOutUpRight size={14} />, keywords: 'unsplit', run: () => detachPane(activeTab.id) } as PaletteItem] : []),
        ]
      : []),
    ...(activeTab
      ? [{ id: 'close', group: 'Actions', label: isSplit ? 'Close pane' : 'Close tab', icon: <X size={14} />, shortcut: [mod, '⇧', 'W'], run: () => handleCloseTab(activeTab.id) } as PaletteItem]
      : []),
  ];

  return (
    <>
    <div
      className={`flex flex-col h-full w-full bg-app transition-[filter] duration-200 ${lock.locked ? 'blur-2xl saturate-50 select-none' : ''}`}
      // While locked nothing underneath can be focused, clicked or read by assistive tech.
      inert={lock.locked || undefined}
      aria-hidden={lock.locked || undefined}
    >
      <TitleBar
        platform={platform}
        tabs={shownTabs}
        groups={groups}
        activeTabId={activeTabId}
        sidebarOpen={!sidebar.rail}
        onToggleSidebar={toggleRail}
        onSelect={setActiveTabId}
        onClose={handleCloseTab}
        onCloseGroup={closeGroup}
        onTabMenu={tabMenu}
        onDetach={detachPane}
        onHome={() => setActiveTabId(null)}
        onPalette={() => setPaletteOpen(true)}
        onSettings={() => setSettingsOpen('appearance')}
      />

      <div className="flex flex-1 min-h-0">
        <Sidebar
          width={sidebar.width}
          rail={sidebar.rail}
          onResize={(width, rail) => setSidebar({ width, rail })}
          folders={library.folders}
          sshProfiles={sshProfiles}
          rdpProfiles={rdpProfiles}
          streamProfiles={streamProfiles}
          meta={library.meta}
          connectedIds={connectedProfileIds}
          renamingId={library.renamingId}
          onRenameDone={() => library.setRenamingId(null)}
          actions={library.actions}
          onNewHost={() => openConnectDialog(null)}
          onNewFolder={() => library.newFolder('')}
          onBackgroundMenu={library.backgroundMenu}
        />

        <main className="flex flex-col flex-1 min-w-0 gap-2 pr-2">
          <SplitView
            tabs={shownTabs}
            groups={groups}
            activeTabId={activeTabId}
            empty={
              <div className="card absolute inset-0 overflow-hidden">
                <Welcome
                  platform={platform}
                  profiles={sshProfiles}
                  recent={recentHosts(library.hosts, 6)}
                  onOpenHost={library.actions.openHost}
                  onConnect={handleProfileConnect}
                  onQuickConnect={quickConnect}
                  onNew={() => openConnectDialog(null)}
                  onImport={() => library.setImportOpen(true)}
                  workspaces={workspaces}
                  onOpenWorkspace={(w) => void openWorkspace(w)}
                  onDeleteWorkspace={(w) => void removeWorkspace(w)}
                />
              </div>
            }
            onFocus={setActiveTabId}
            onResize={(groupId, splitId, sizes) =>
              setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, root: setSplitSizes(g.root, splitId, sizes) } : g)))
            }
            onDrop={handlePaneDrop}
            onSplit={splitPane}
            onClose={handleCloseTab}
            paneMenu={(e, id) =>
              openMenu(e, [...paneEntries(id), { type: 'separator' }, { label: 'Close pane', icon: <X size={13} />, onSelect: () => handleCloseTab(id) }])
            }
            renderPane={(tab, { visible, focused }) =>
              tab.started && tab.rdp ? (
                <div className="absolute inset-0 bg-black">
                  {tab.rdpSession && (
                  <RdpPane
                    tabId={tab.id}
                    session={tab.rdpSession}
                    visible={visible}
                    focused={focused}
                    dynamicResolution={tab.rdp.options?.dynamicRes ?? true}
                    fullscreen={rdpFull === tab.id}
                    title={`${tab.rdp.name} · ${tab.rdp.host}`}
                    onExitFullscreen={exitRdpFullscreen}
                    onDisconnect={() => handleDisconnect(tab.id)}
                    onConnected={(connectionId) => {
                      if (rdpConnections.current.get(tab.id)?.id !== connectionId) return;
                      patchTab(tab.id, { status: 'connected' });
                      // "Full screen" in the host's settings opens it that way.
                      if (tab.rdp?.fullscreen) enterRdpFullscreen(tab.id);
                    }}
                    onEnded={(connectionId, error, auth) => void handleRdpEnded(tab, connectionId, error, auth)}
                  />
                  )}
                  {tab.status === 'connecting' && <RdpConnecting tab={tab} />}
                  {tab.status !== 'connecting' && tab.status !== 'connected' && <StatusOverlay tab={tab} onReconnect={() => handleReconnect(tab)} onCancelRetry={() => cancelRetry(tab.id)} />}
                </div>
              ) : tab.started && tab.profile?.sftpOnly ? (
                // SFTP-only host: no shell, the file manager is the whole pane.
                <>
                  {tab.status === 'connected' && (
                    <SftpPanel fill connectionId={tab.id} visible={visible} onClose={() => {}} />
                  )}
                  {tab.status !== 'connected' && <StatusOverlay tab={tab} onReconnect={() => handleReconnect(tab)} onCancelRetry={() => cancelRetry(tab.id)} onDetails={() => setSSHDiagnostic(tab.sshDiagnostic)} />}
                </>
              ) : tab.started ? (
                <>
                  <XTermWrapper
                    connectionId={tab.id}
                    visible={visible}
                    focused={focused}
                    connected={tab.status === 'connected'}
                    menuExtras={paneEntries(tab.id)}
                    hostLabel={tab.profile ? `${tab.profile.username}@${tab.profile.host}` : tab.host}
                    themeId={(sshProfiles.find((p) => p.id === tab.profile?.id) ?? tab.profile)?.options?.themeId}
                    onSize={(cols, rows) => setSizes((s) => ({ ...s, [tab.id]: { cols, rows } }))}
                  />
                  {tab.status !== 'connected' && <StatusOverlay tab={tab} onReconnect={() => handleReconnect(tab)} onCancelRetry={() => cancelRetry(tab.id)} onDetails={() => setSSHDiagnostic(tab.sshDiagnostic)} />}
                </>
              ) : (
                <PendingTab tab={tab} onConnect={() => (tab.rdp || tab.container ? handleReconnect(tab) : openConnectDialog(tab.id))} onDetails={() => setSSHDiagnostic(tab.sshDiagnostic)} />
              )
            }
          />

          {tabs.map(
            (tab) =>
              tab.status === 'connected' &&
              !tab.profile?.sftpOnly &&
              sftpOpenFor[tab.id] && (
                <SftpPanel
                  key={tab.id}
                  connectionId={tab.id}
                  visible={tab.id === activeTabId}
                  onClose={() => setSftpOpenFor((s) => ({ ...s, [tab.id]: false }))}
                />
              )
          )}
        </main>
      </div>

      <StatusBar
        tab={activeTab}
        size={activeTab ? sizes[activeTab.id] ?? null : null}
        sftpOpen={sftpOpen}
        openTabs={tabs.length}
        onToggleSftp={toggleSftp}
        onDisconnect={() => activeTab && handleDisconnect(activeTab.id)}
        onReconnect={() => activeTab && handleReconnect(activeTab)}
        onOpenSecurity={() => setSettingsOpen('security')}
        onOpenUpdates={() => setSettingsOpen('about')}
        masking={masking}
        onToggleMasking={toggleMasking}
        lockConfigured={lock.configured}
        onLock={() => void lockApp()}
        onOpenSnippets={() => setSnippetsOpen(true)}
        onOpenRecordings={() => setRecordingsOpen(true)}
        onOpenContainers={() => activeTab && setContainersFor(activeTab.id)}
        onRdpFullscreen={() => activeTab && enterRdpFullscreen(activeTab.id)}
        broadcast={broadcast}
        onToggleBroadcast={toggleBroadcast}
      />

      {paletteOpen && (
        <CommandPalette items={paletteItems} onQuickConnect={quickConnect} onClose={() => setPaletteOpen(false)} />
      )}

      {connectDialog && (
        <ConnectDialog
          key={connectDialog.key}
          initial={connectDialog.initial}
          folders={library.folderChoices}
          notes={notesOf('ssh', connectDialog.initial?.id)}
          onSaveNotes={(id, v) => void library.saveMeta('ssh', id, v)}
          onClose={() => setConnectDialog(null)}
          onConnect={handleDialogConnect}
          onSwitchToRdp={
            connectDialog.tabId
              ? undefined
              : ({ host, folderId }) => {
                  modalSwap.pending = true;
                  setConnectDialog(null);
                  openRdpDialog({ host, folderId: folderId || undefined });
                }
          }
        />
      )}

      {bulkHosts && (
        <BulkEditDialog
          hosts={bulkHosts}
          folders={library.folderChoices}
          sshProfiles={sshProfiles}
          onClose={() => setBulkHosts(null)}
          onDone={() => {
            setBulkHosts(null);
            void loadProfiles();
          }}
        />
      )}

      {inventoriesOpen && (
        <InventoriesDialog
          onClose={() => setInventoriesOpen(false)}
          onSynced={() => void loadProfiles()}
        />
      )}

      {streamDialog && (
        <StreamDialog
          key={streamDialog.profile?.id ?? streamDialog.kind}
          initial={streamDialog}
          folders={library.folderChoices}
          onClose={() => setStreamDialog(null)}
          onConnect={(spec) => {
            setStreamDialog(null);
            openStream(spec);
          }}
          onSave={(p, connect) => void saveStream(p, connect)}
          notes={notesOf('stream', streamDialog.profile?.id)}
          onSaveNotes={(id, v) => void library.saveMeta('stream', id, v)}
        />
      )}

      {(() => {
        const t = tabs.find((x) => x.id === containersFor);
        return t ? <ContainersDialog tab={t} onClose={() => setContainersFor(null)} onOpen={(c) => openExec(t, c)} /> : null;
      })()}

      {(() => {
        const t = tabs.find((x) => x.id === installKeyFor);
        if (!t) return null;
        return (
          <InstallKeyDialog
            tab={t}
            saved={sshProfiles.find((p) => p.id === t.profile?.id)}
            onClose={() => setInstallKeyFor(null)}
            onGenerate={() => {
              setInstallKeyFor(null);
              setSettingsOpen('keys');
            }}
            onUseKey={(p, key) => {
              SaveSSHProfile(sshForSave({ ...p, password: '', authType: 'key', keyPath: key.path }))
                .then(() => {
                  dialogs.toast(`${p.name} now logs in with ${key.name}`, 'success');
                  return loadProfiles();
                })
                .catch((err) => dialogs.toast(`Host not updated: ${errorText(err)}`, 'error'));
            }}
          />
        );
      })()}

      {recordingsOpen && <RecordingsDialog onClose={() => setRecordingsOpen(false)} />}

      {snippetsOpen && (
        <SnippetsDialog
          paneId={activeTab?.status === 'connected' ? activeTab.id : null}
          builtins={{ host: activeTab?.profile?.host ?? '', user: activeTab?.profile?.username ?? '' }}
          broadcasting={broadcast.enabled}
          onClose={() => setSnippetsOpen(false)}
        />
      )}

      {settingsOpen && <SettingsDialog modKey={mod} initial={settingsOpen} onClose={() => setSettingsOpen(null)} />}

      {rdpDialog && (
        <RdpDialog
          key={rdpDialog.key}
          initial={rdpDialog.initial}
          onClose={() => setRdpDialog(null)}
          onSave={handleSaveRDP}
          notes={notesOf('rdp', rdpDialog.initial?.id)}
          onSaveNotes={(id, v) => void library.saveMeta('rdp', id, v)}
          onSwitchToSsh={({ host, folderId }) => {
            modalSwap.pending = true;
            setRdpDialog(null);
            openConnectDialog(null, { host, folderId: folderId || undefined });
          }}
        />
      )}

      {sshDiagnostic && <SSHDiagnosticDialog report={sshDiagnostic} onClose={() => setSSHDiagnostic(undefined)} />}

      {library.importOpen && (
        <ImportDialog
          existingSSH={sshProfiles}
          existingRDP={rdpProfiles}
          onClose={() => library.setImportOpen(false)}
          onImport={library.importHosts}
        />
      )}
    </div>
    {lock.locked && <LockScreen sessions={tabs.filter((t) => t.status === 'connected').length} />}
    </>
  );
}

function PendingTab({ tab, onConnect, onDetails }: { tab: TerminalTab; onConnect: () => void; onDetails: () => void }) {
  if (tab.status === 'connecting') {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 animate-fade-in">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-2 border-accent/15" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-gray-200 font-medium">Connecting to {tab.title}</p>
          <p className="text-2xs text-gray-500 font-mono mt-1">
            {tab.profile ? `${tab.profile.username}@${tab.profile.host}:${tab.profile.port}` : tab.host}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 text-gray-500">
      <p>{tab.sshDiagnostic ? 'SSH connection failed.' : 'This tab is not connected.'}</p>
      <div className="flex items-center gap-2">
        {tab.sshDiagnostic && <button className="btn-secondary" onClick={onDetails}>Details</button>}
        <button className="btn-primary" onClick={onConnect}>Connect</button>
      </div>
    </div>
  );
}

function RdpConnecting({ tab }: { tab: TerminalTab }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-gray-300 animate-fade-in">
      <Loader2 size={22} className="animate-spin text-accent" />
      <span>Connecting to {tab.title}…</span>
    </div>
  );
}

function StatusOverlay({ tab, onReconnect, onCancelRetry, onDetails }: { tab: TerminalTab; onReconnect: () => void; onCancelRetry: () => void; onDetails?: () => void }) {
  // Tick once a second while a reconnect is scheduled, for the countdown.
  const [, setNow] = useState(0);
  useEffect(() => {
    if (!tab.retry || tab.status !== 'disconnected') return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [tab.retry, tab.status]);
  if (tab.retry) {
    const secs = Math.max(0, Math.ceil((tab.retry.at - Date.now()) / 1000));
    return (
      <div className="absolute inset-x-0 bottom-5 flex justify-center pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-3 pl-4 pr-1.5 py-1.5 rounded-xl bg-surface-raised/90 backdrop-blur-xl shadow-pop animate-slide-up" role="status">
          <span className="flex items-center gap-2 text-gray-300">
            {tab.status === 'connecting' ? (
              <>
                <Loader2 size={14} className="animate-spin text-accent" /> Reconnecting… (attempt {tab.retry.attempt} of {RETRY_MAX})
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Connection lost. Reconnecting in {secs} s
              </>
            )}
          </span>
          {tab.status !== 'connecting' && (
            <button className="btn-primary h-7" onClick={onReconnect}>
              <RotateCw size={13} /> Now
            </button>
          )}
          <button className="btn-ghost h-7 px-2.5" onClick={onCancelRetry}>
            Cancel
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="absolute inset-x-0 bottom-5 flex justify-center pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 pl-4 pr-1.5 py-1.5 rounded-xl bg-surface-raised/90 backdrop-blur-xl shadow-pop animate-slide-up">
        {tab.status === 'connecting' ? (
          <span className="flex items-center gap-2 pr-3 text-gray-300">
            <Loader2 size={14} className="animate-spin text-accent" /> Reconnecting…
          </span>
        ) : (
          <>
            <span className="flex items-center gap-2 text-gray-300">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> {tab.sshDiagnostic ? 'SSH connection failed' : 'Connection closed'}
            </span>
            {tab.sshDiagnostic && onDetails && <button className="btn-ghost h-7 px-2.5" onClick={onDetails}>Details</button>}
            <button className="btn-primary h-7" onClick={onReconnect}>
              <RotateCw size={13} /> Reconnect
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
