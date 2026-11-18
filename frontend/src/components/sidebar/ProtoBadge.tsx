import { Cable, Monitor, Network } from 'lucide-react';
import type { HostItem } from './tree';

type Proto = 'ssh' | 'sftp' | 'rdp' | 'telnet' | 'serial';

const STYLE: Record<Proto, string> = {
  ssh: 'text-emerald-300/90 bg-emerald-400/10 ring-emerald-400/20',
  sftp: 'text-sky-300/90 bg-sky-400/10 ring-sky-400/20',
  rdp: 'text-violet-300/90 bg-violet-400/10 ring-violet-400/20',
  telnet: 'text-amber-300/90 bg-amber-400/10 ring-amber-400/20',
  serial: 'text-orange-300/90 bg-orange-400/10 ring-orange-400/20',
};

const TITLE: Record<Proto, string> = {
  ssh: 'SSH terminal (with SFTP)',
  sftp: 'SFTP only, no shell',
  rdp: 'Remote Desktop (RDP)',
  telnet: 'Telnet (not encrypted)',
  serial: 'Serial port',
};

const LABEL: Record<Proto, string> = { ssh: 'ssh', sftp: 'sftp', rdp: 'rdp', telnet: 'tel', serial: 'com' };

export function protoOf(h: HostItem): Proto {
  if (h.kind === 'rdp') return 'rdp';
  if (h.kind === 'stream') return h.profile.kind;
  return h.profile.sftpOnly ? 'sftp' : 'ssh';
}

/** The avatar icon for hosts that are not SSH (those show initials). */
export function hostIcon(h: HostItem, size: number) {
  if (h.kind === 'rdp') return <Monitor size={size} />;
  if (h.kind === 'stream') return h.profile.kind === 'serial' ? <Cable size={size} /> : <Network size={size} />;
  return undefined;
}

/** Small protocol tag shown next to a host name. */
export function ProtoBadge({ host }: { host: HostItem }) {
  const p = protoOf(host);
  return (
    <span
      title={TITLE[p]}
      className={`flex-shrink-0 px-1 h-[14px] inline-flex items-center rounded text-[9px] font-semibold uppercase tracking-wide ring-1 ring-inset ${STYLE[p]}`}
    >
      {LABEL[p]}
    </span>
  );
}
