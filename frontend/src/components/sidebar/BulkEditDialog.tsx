import { useState } from 'react';
import type { ReactNode } from 'react';
import { Folder, FolderOpen, Layers, PenLine, UserRound } from 'lucide-react';
import type { SSHProfile } from '../../types';
import type { HostItem } from './tree';
import { Modal, errorText, useDialogs } from '../ui/Dialogs';
import { Select } from '../ui/Select';
import { JumpHostSelect } from '../terminal/TunnelEditor';
import { useIdentities } from '../../lib/identities';
import { HOST_COLORS } from '../../lib/hostOptions';
import { rdpForSave, sshForSave } from '../../lib/profiles';
import { MoveItem, SaveRDPProfile, SaveSSHProfile, SelectKeyFile } from '../../../wailsjs/go/main/App';

interface Props {
  hosts: HostItem[];
  folders: { id: string; label: string; depth: number }[];
  sshProfiles: SSHProfile[];
  onClose: () => void;
  onDone: () => void;
}

type FieldId = 'folder' | 'user' | 'identity' | 'key' | 'jump' | 'color';

/** Changes the same settings on many hosts at once. Only ticked fields are written. */
export function BulkEditDialog({ hosts, folders, sshProfiles, onClose, onDone }: Props) {
  const dialogs = useDialogs();
  const identities = useIdentities();
  const ssh = hosts.filter((h) => h.kind === 'ssh');
  const rdp = hosts.filter((h) => h.kind === 'rdp');
  const [on, setOn] = useState<Set<FieldId>>(new Set());
  const [folderId, setFolderId] = useState('');
  const [user, setUser] = useState('');
  const [identityId, setIdentityId] = useState('');
  const [keyPath, setKeyPath] = useState('');
  const [jumpId, setJumpId] = useState('');
  const [color, setColor] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = (f: FieldId, v: boolean) =>
    setOn((s) => {
      const n = new Set(s);
      if (v) n.add(f);
      else n.delete(f);
      return n;
    });

  const apply = async () => {
    setBusy(true);
    let failed = 0;
    for (const h of hosts) {
      try {
        if (h.kind === 'ssh') {
          const cur = sshProfiles.find((p) => p.id === h.id) ?? h.profile;
          const p: SSHProfile = {
            ...cur,
            password: '',
            proxy: cur.proxy ? { ...cur.proxy, password: '' } : undefined,
            options: { ...cur.options!, ...(on.has('color') ? { color } : {}) },
          };
          if (on.has('identity')) p.identityId = identityId;
          if (on.has('user')) {
            p.username = user.trim();
            if (!on.has('identity')) p.identityId = '';
          }
          if (on.has('key')) {
            p.authType = 'key';
            p.keyPath = keyPath.trim();
            if (!on.has('identity')) p.identityId = '';
          }
          if (on.has('jump')) p.jumpProfileId = jumpId === h.id ? '' : jumpId;
          if (on.has('user') || on.has('identity') || on.has('key') || on.has('jump') || on.has('color')) await SaveSSHProfile(sshForSave(p));
        } else if (h.kind === 'rdp' && on.has('user')) {
          await SaveRDPProfile(rdpForSave({ ...h.profile, password: '', username: user.trim() }));
        }
        if (on.has('folder') && h.folderId !== folderId) await MoveItem(h.kind, h.id, folderId, -1);
      } catch (err) {
        failed++;
        if (failed === 1) dialogs.toast(`${h.name}: ${errorText(err)}`, 'error');
      }
    }
    setBusy(false);
    dialogs.toast(failed ? `Updated ${hosts.length - failed} of ${hosts.length} hosts` : `Updated ${hosts.length} hosts`, failed ? 'error' : 'success');
    onDone();
  };

  const browseKey = async () => {
    try {
      const p = await SelectKeyFile();
      if (p) setKeyPath(p);
    } catch {
      // cancelled
    }
  };

  const kinds = [ssh.length && `${ssh.length} SSH`, rdp.length && `${rdp.length} RDP`, hosts.length - ssh.length - rdp.length && `${hosts.length - ssh.length - rdp.length} Telnet/serial`]
    .filter(Boolean)
    .join(', ');

  return (
    <Modal title={`Edit ${hosts.length} hosts`} subtitle={`${kinds}. Only the ticked fields are changed.`} onClose={onClose} width="max-w-lg">
      <div className="px-5 pb-5 pt-1 space-y-3">
        <Row id="folder" on={on} toggle={toggle} label="Folder" note="all hosts">
          <Select
            value={folderId}
            onChange={setFolderId}
            options={[
              { value: '', label: 'Top level', icon: <Layers size={13} className="text-gray-500" /> },
              ...folders.map((f) => ({ value: f.id, label: f.label, depth: f.depth, icon: <Folder size={13} className="text-gray-400" /> })),
            ]}
          />
        </Row>
        <Row id="user" on={on} toggle={toggle} label="User name" note="SSH and RDP" disabled={ssh.length + rdp.length === 0}>
          <input className="input-field font-mono" value={user} onChange={(e) => setUser(e.target.value)} placeholder="root" spellCheck={false} />
        </Row>
        <Row id="identity" on={on} toggle={toggle} label="Identity" note="SSH" disabled={ssh.length === 0 || identities.length === 0}>
          <Select
            value={identityId}
            onChange={setIdentityId}
            options={[
              { value: '', label: 'None (the host’s own login)', icon: <PenLine size={13} className="text-gray-500" /> },
              ...identities.map((i) => ({ value: i.id, label: `${i.name} (${i.username})`, icon: <UserRound size={13} className="text-gray-400" /> })),
            ]}
          />
        </Row>
        <Row id="key" on={on} toggle={toggle} label="SSH key" note="switches to key login" disabled={ssh.length === 0}>
          <div className="flex gap-2">
            <input className="input-field font-mono" value={keyPath} onChange={(e) => setKeyPath(e.target.value)} placeholder="~/.ssh/id_ed25519 (empty = default keys)" spellCheck={false} />
            <button type="button" className="btn-secondary h-9 px-2.5 flex-shrink-0" onClick={browseKey} title="Browse">
              <FolderOpen size={14} />
            </button>
          </div>
        </Row>
        <Row id="jump" on={on} toggle={toggle} label="Jump host" note="SSH" disabled={ssh.length === 0}>
          <JumpHostSelect value={jumpId} onChange={setJumpId} />
        </Row>
        <Row id="color" on={on} toggle={toggle} label="Color tag" note="SSH" disabled={ssh.length === 0}>
          <div className="flex items-center gap-1.5 h-9">
            <button
              type="button"
              className={`h-6 px-2 rounded-md text-2xs ${!color ? 'bg-white/[0.09] text-gray-200' : 'text-gray-500 hover:text-gray-300'}`}
              onClick={() => setColor('')}
            >
              None
            </button>
            {HOST_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                title={c.label}
                aria-label={c.label}
                className={`w-6 h-6 rounded-full transition-transform ${color === c.id ? 'ring-2 ring-offset-2 ring-offset-surface-raised scale-110' : 'opacity-70 hover:opacity-100'}`}
                style={{ background: c.value, ['--tw-ring-color' as string]: c.value }}
                onClick={() => setColor(c.id)}
              />
            ))}
          </div>
        </Row>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost h-8 px-3" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={on.size === 0 || busy} onClick={() => void apply()}>
            {busy ? 'Saving…' : `Apply to ${hosts.length} hosts`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Row({
  id,
  on,
  toggle,
  label,
  note,
  disabled,
  children,
}: {
  id: FieldId;
  on: Set<FieldId>;
  toggle: (f: FieldId, v: boolean) => void;
  label: string;
  note?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const checked = on.has(id);
  return (
    <div className={`grid grid-cols-[140px_1fr] items-start gap-3 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <label className="flex items-start gap-2 pt-2 text-[12.5px] text-gray-300 cursor-pointer select-none">
        <input type="checkbox" className="mt-0.5 accent-[rgb(var(--accent))] w-3.5 h-3.5" checked={checked} disabled={disabled} onChange={(e) => toggle(id, e.target.checked)} />
        <span>
          {label}
          {note && <span className="block text-2xs text-gray-600">{note}</span>}
        </span>
      </label>
      <div className={checked ? '' : 'opacity-50'} onFocusCapture={() => !checked && toggle(id, true)}>
        {children}
      </div>
    </div>
  );
}
