import type { HostItem } from './tree';

type Proto = 'ssh' | 'sftp' | 'rdp';

const STYLE: Record<Proto, string> = {
  ssh: 'text-emerald-300/90 bg-emerald-400/10 ring-emerald-400/20',
  sftp: 'text-sky-300/90 bg-sky-400/10 ring-sky-400/20',
  rdp: 'text-violet-300/90 bg-violet-400/10 ring-violet-400/20',
};

const TITLE: Record<Proto, string> = {
  ssh: 'SSH terminal (with SFTP)',
  sftp: 'SFTP only, no shell',
  rdp: 'Remote Desktop (RDP)',
};

export function protoOf(h: HostItem): Proto {
  if (h.kind === 'rdp') return 'rdp';
  return h.profile.sftpOnly ? 'sftp' : 'ssh';
}

/** Small protocol tag shown next to a host name. */
export function ProtoBadge({ host }: { host: HostItem }) {
  const p = protoOf(host);
  return (
    <span
      title={TITLE[p]}
      className={`flex-shrink-0 px-1 h-[14px] inline-flex items-center rounded text-[9px] font-semibold uppercase tracking-wide ring-1 ring-inset ${STYLE[p]}`}
    >
      {p}
    </span>
  );
}
