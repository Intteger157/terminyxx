import { Terminal, Monitor, Plus, Server } from 'lucide-react';
import type { RDPProfile, SSHProfile } from '../../types';

interface SidebarProps {
  sshProfiles: SSHProfile[];
  rdpProfiles: RDPProfile[];
  onConnectSSH: (profile: SSHProfile) => void;
  onConnectRDP: (profile: RDPProfile) => void;
  onNewSSH: () => void;
  onNewRDP: () => void;
}

export function Sidebar({
  sshProfiles,
  rdpProfiles,
  onConnectSSH,
  onConnectRDP,
  onNewSSH,
  onNewRDP,
}: SidebarProps) {
  return (
    <aside className="w-56 flex-shrink-0 bg-surface-raised border-r border-border flex flex-col">
      <div className="px-4 py-3 border-b border-border">
        <h1 className="text-sm font-bold tracking-wide text-white flex items-center gap-2">
          <Terminal size={16} className="text-accent" />
          Terminyxx
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Section
          title="SSH Hosts"
          icon={<Server size={14} />}
          onAdd={onNewSSH}
        >
          {sshProfiles.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-500">Нет сохранённых хостов</p>
          )}
          {sshProfiles.map((profile) => (
            <button
              key={profile.id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-surface-overlay transition-colors flex flex-col"
              onClick={() => onConnectSSH(profile)}
              title={`${profile.username}@${profile.host}:${profile.port}`}
            >
              <span className="text-gray-200 truncate">{profile.name}</span>
              <span className="text-xs text-gray-500 truncate">
                {profile.username}@{profile.host}
              </span>
            </button>
          ))}
        </Section>

        <Section
          title="RDP Sessions"
          icon={<Monitor size={14} />}
          onAdd={onNewRDP}
        >
          {rdpProfiles.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-500">Нет RDP-профилей</p>
          )}
          {rdpProfiles.map((profile) => (
            <button
              key={profile.id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-surface-overlay transition-colors flex flex-col"
              onClick={() => onConnectRDP(profile)}
              title={profile.host}
            >
              <span className="text-gray-200 truncate">{profile.name}</span>
              <span className="text-xs text-gray-500 truncate">{profile.host}</span>
            </button>
          ))}
        </Section>
      </div>
    </aside>
  );
}

function Section({
  title,
  icon,
  onAdd,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="py-2">
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
          {icon}
          {title}
        </span>
        <button className="btn-ghost p-1" onClick={onAdd} title={`Добавить ${title}`}>
          <Plus size={14} />
        </button>
      </div>
      {children}
    </div>
  );
}
