import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { TabBar } from './components/layout/TabBar';
import { Toolbar } from './components/layout/Toolbar';
import { XTermWrapper } from './components/terminal/XTermWrapper';
import { ConnectDialog } from './components/terminal/ConnectDialog';
import { SftpPanel } from './components/sftp/SftpPanel';
import { RdpDialog } from './components/rdp/RdpDialog';
import { useHotkeys } from './hooks/useHotkeys';
import type { RDPProfile, SSHProfile, TerminalTab } from './types';
import {
  LaunchRDP,
  ListRDPProfiles,
  ListSSHProfiles,
  SaveRDPProfile,
  SaveSSHProfile,
  SSHConnect,
  SSHDisconnect,
} from '../wailsjs/go/main/App';

function App() {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [sshProfiles, setSSHProfiles] = useState<SSHProfile[]>([]);
  const [rdpProfiles, setRDPProfiles] = useState<RDPProfile[]>([]);
  const [connectOpen, setConnectOpen] = useState(false);
  const [rdpOpen, setRdpOpen] = useState(false);
  const [connectInitial, setConnectInitial] = useState<Partial<SSHProfile> | undefined>();
  const [sftpOpen, setSftpOpen] = useState(false);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  const loadProfiles = useCallback(async () => {
    try {
      const [ssh, rdp] = await Promise.all([ListSSHProfiles(), ListRDPProfiles()]);
      setSSHProfiles(ssh ?? []);
      setRDPProfiles(rdp ?? []);
    } catch (err) {
      console.error('load profiles:', err);
    }
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const addTab = (title = 'Новая вкладка', host = '') => {
    const id = crypto.randomUUID();
    const tab: TerminalTab = { id, title, connected: false, host };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(id);
    return id;
  };

  const handleNewTab = () => {
    addTab();
    setConnectOpen(true);
    setConnectInitial(undefined);
  };

  const handleConnect = async (profile: SSHProfile, save: boolean) => {
    let tabId = activeTabId;
    if (!tabId || tabs.find((t) => t.id === tabId)?.connected) {
      tabId = addTab(profile.name, profile.host);
    }

    try {
      await SSHConnect({
        id: tabId,
        host: profile.host,
        port: profile.port,
        username: profile.username,
        authType: profile.authType,
        password: profile.password,
        keyPath: profile.keyPath,
      });

      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? { ...t, title: profile.name, host: profile.host, connected: true, profileId: profile.id }
            : t
        )
      );

      if (save) {
        await SaveSSHProfile(profile);
        await loadProfiles();
      }

      setConnectOpen(false);
    } catch (err) {
      alert(`Ошибка подключения: ${err}`);
    }
  };

  const handleDisconnect = async () => {
    if (!activeTabId) return;
    try {
      await SSHDisconnect(activeTabId);
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, connected: false } : t))
      );
      setSftpOpen(false);
    } catch (err) {
      console.error('disconnect:', err);
    }
  };

  const handleCloseTab = async (id: string) => {
    const tab = tabs.find((t) => t.id === id);
    if (tab?.connected) {
      try {
        await SSHDisconnect(id);
      } catch {
        // ignore
      }
    }
    setTabs((prev) => prev.filter((t) => t.id !== id));
    if (activeTabId === id) {
      const remaining = tabs.filter((t) => t.id !== id);
      setActiveTabId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
    }
    if (activeTabId === id) setSftpOpen(false);
  };

  const handleConnectSSHFromSidebar = (profile: SSHProfile) => {
    const id = addTab(profile.name, profile.host);
    setActiveTabId(id);
    handleConnect(profile, false);
  };

  const handleConnectRDP = async (profile: RDPProfile) => {
    try {
      await LaunchRDP(profile.id);
    } catch (err) {
      alert(`Ошибка запуска RDP: ${err}`);
    }
  };

  const handleSaveRDP = async (profile: RDPProfile) => {
    await SaveRDPProfile(profile);
    await loadProfiles();
    setRdpOpen(false);
  };

  useHotkeys(
    {
      'Ctrl+Shift+F': () => {
        if (activeTab?.connected) setSftpOpen((v) => !v);
      },
    },
    !!activeTab?.connected
  );

  return (
    <div className="flex h-full w-full">
      <Sidebar
        sshProfiles={sshProfiles}
        rdpProfiles={rdpProfiles}
        onConnectSSH={handleConnectSSHFromSidebar}
        onConnectRDP={handleConnectRDP}
        onNewSSH={() => { setConnectInitial(undefined); setConnectOpen(true); }}
        onNewRDP={() => setRdpOpen(true)}
      />

      <div className="flex flex-col flex-1 min-w-0">
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onSelect={setActiveTabId}
          onClose={handleCloseTab}
          onNew={handleNewTab}
        />

        {activeTab ? (
          <>
            <Toolbar
              connected={activeTab.connected}
              sftpOpen={sftpOpen}
              onConnect={() => { setConnectInitial(undefined); setConnectOpen(true); }}
              onDisconnect={handleDisconnect}
              onToggleSftp={() => setSftpOpen((v) => !v)}
            />
            <div className="flex-1 min-h-0 relative">
              {tabs.map((tab) => (
                tab.connected ? (
                  <XTermWrapper
                    key={tab.id}
                    connectionId={tab.id}
                    active={tab.id === activeTabId}
                    onDisconnected={() =>
                      setTabs((prev) =>
                        prev.map((t) => (t.id === tab.id ? { ...t, connected: false } : t))
                      )
                    }
                  />
                ) : (
                  <div
                    key={tab.id}
                    className={`h-full flex items-center justify-center text-gray-500 text-sm ${
                      tab.id === activeTabId ? 'block' : 'hidden'
                    }`}
                  >
                    Не подключено. Нажмите «Подключить» для начала SSH-сессии.
                  </div>
                )
              ))}
            </div>
            {activeTab.connected && (
              <SftpPanel connectionId={activeTab.id} open={sftpOpen} />
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
            Нажмите + чтобы открыть новую вкладку
          </div>
        )}
      </div>

      <ConnectDialog
        open={connectOpen}
        initial={connectInitial}
        onClose={() => setConnectOpen(false)}
        onConnect={handleConnect}
      />

      <RdpDialog
        open={rdpOpen}
        onClose={() => setRdpOpen(false)}
        onSave={handleSaveRDP}
      />
    </div>
  );
}

export default App;
