import { useCallback, useEffect, useState } from 'react';
import { Cloud, Pencil, Plus, RefreshCw, Server, Trash2 } from 'lucide-react';
import { Modal, errorText, useDialogs } from '../ui/Dialogs';
import { Select } from '../ui/Select';
import { Field, Toggle } from '../terminal/ConnectDialog';
import { useIdentities } from '../../lib/identities';
import { DeleteInventory, ListInventories, SaveInventory, SyncInventory } from '../../../wailsjs/go/main/App';
import { store } from '../../../wailsjs/go/models';

type Inventory = store.Inventory;

const KINDS = [
  { value: 'proxmox', label: 'Proxmox VE' },
  { value: 'aws', label: 'AWS EC2' },
];

const emptyInventory = (kind: string): Inventory =>
  store.Inventory.createFrom({
    id: crypto.randomUUID(),
    name: kind === 'aws' ? 'AWS' : 'Proxmox',
    kind,
    folderId: '',
    lastSync: 0,
    secret: '',
    hasSecret: false,
    clearSecret: false,
    hosts: 0,
    config: {
      url: '',
      tokenId: '',
      fingerprint: '',
      accessKeyId: '',
      regions: kind === 'aws' ? ['us-east-1'] : [],
      username: kind === 'aws' ? 'ec2-user' : 'root',
      keyPath: '',
      identityId: '',
      address: 'private',
      runningOnly: false,
    },
  });

function when(ms: number): string {
  if (!ms) return 'never refreshed';
  const d = new Date(ms);
  return `refreshed ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

/** Cloud and hypervisor accounts whose machines are mirrored into the host library. */
export function InventoriesDialog({ onClose, onSynced }: { onClose: () => void; onSynced: () => void }) {
  const dialogs = useDialogs();
  const [list, setList] = useState<Inventory[]>([]);
  const [editing, setEditing] = useState<Inventory | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setList((await ListInventories()) ?? []);
    } catch (err) {
      dialogs.toast(`Could not load inventories: ${errorText(err)}`, 'error');
    }
  }, [dialogs]);
  useEffect(() => void reload(), [reload]);

  const sync = async (inv: Inventory) => {
    setBusy(inv.id);
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await SyncInventory(inv.id);
          const parts = [`${r.added} added`, `${r.updated} updated`, `${r.unchanged} unchanged`];
          if (r.noAddress) parts.push(`${r.noAddress} without an IP address skipped`);
          dialogs.toast(`${inv.name}: ${parts.join(', ')}`, 'success');
          if (r.gone?.length) {
            dialogs.toast(`No longer in ${inv.name} (kept in the library): ${r.gone.slice(0, 8).join(', ')}${r.gone.length > 8 ? '…' : ''}`);
          }
          onSynced();
          break;
        } catch (err) {
          const text = errorText(err);
          const m = text.match(/^INVCERT_UNKNOWN\|([0-9a-f]{64})\|(.*)$/);
          if (!m || attempt > 0) throw err;
          const fp = m[1];
          const changed = !!inv.config.fingerprint;
          const reason = changed
            ? 'The certificate fingerprint differs from the one saved for this inventory.'
            : 'The certificate could not be verified for the configured address.';
          const ok = await dialogs.confirm({
            title: changed ? 'Proxmox certificate changed' : 'Unverified Proxmox certificate',
            message: `${reason}\n\n${inv.config.url}\n${m[2]}\nSHA-256 ${fp.match(/.{2}/g)!.join(':')}\n\nCompare this with the fingerprint in Proxmox (Datacenter → node → Certificates) before you trust it.`,
            confirmLabel: changed ? 'Replace and refresh' : 'Trust and refresh',
            danger: changed,
            focusCancel: true,
          });
          if (!ok) return;
          await SaveInventory(store.Inventory.createFrom({ ...inv, secret: '', config: { ...inv.config, fingerprint: fp } }));
        }
      }
    } catch (err) {
      dialogs.toast(`${inv.name}: ${errorText(err)}`, 'error');
    } finally {
      setBusy(null);
      void reload();
    }
  };

  const remove = async (inv: Inventory) => {
    const ok = await dialogs.confirm({
      title: `Remove ${inv.name}`,
      message: 'The saved key is deleted from the keychain. The hosts it added stay in the library.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await DeleteInventory(inv.id);
    } catch (err) {
      dialogs.toast(errorText(err), 'error');
    }
    void reload();
  };

  if (editing) {
    return (
      <InventoryForm
        initial={editing}
        isNew={!list.some((x) => x.id === editing.id)}
        onCancel={() => setEditing(null)}
        onSaved={async (inv, refresh) => {
          setEditing(null);
          await reload();
          if (refresh) void sync(inv);
        }}
      />
    );
  }

  return (
    <Modal
      title="Cloud inventories"
      subtitle="Machines from Proxmox or AWS are added to a folder of their own and updated when you refresh."
      icon={<Cloud size={16} />}
      onClose={onClose}
      width="max-w-lg"
    >
      <div className="px-5 pb-5 pt-1 space-y-2">
        {list.length === 0 && <p className="py-6 text-center text-gray-500">No accounts yet.</p>}
        {list.map((inv) => (
          <div key={inv.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
            <span className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
              {inv.kind === 'aws' ? <Cloud size={15} /> : <Server size={15} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-gray-200 truncate">{inv.name}</span>
              <span className="block text-2xs text-gray-500 truncate">
                {KINDS.find((k) => k.value === inv.kind)?.label} · {inv.hosts} host{inv.hosts === 1 ? '' : 's'} · {when(inv.lastSync)}
              </span>
            </span>
            <button className="btn-secondary h-7 px-2.5 text-2xs" disabled={busy !== null} onClick={() => void sync(inv)}>
              <RefreshCw size={12} className={busy === inv.id ? 'animate-spin' : ''} /> Refresh
            </button>
            <button className="icon-btn w-7 h-7" title="Edit" onClick={() => setEditing(inv)}>
              <Pencil size={13} />
            </button>
            <button className="icon-btn w-7 h-7 hover:text-red-300" title="Remove" onClick={() => void remove(inv)}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        <div className="flex justify-between gap-2 pt-2">
          <div className="flex gap-2">
            {KINDS.map((k) => (
              <button key={k.value} className="btn-secondary h-8 px-3" onClick={() => setEditing(emptyInventory(k.value))}>
                <Plus size={13} /> {k.label}
              </button>
            ))}
          </div>
          <button className="btn-ghost h-8 px-3" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

function InventoryForm({
  initial,
  isNew,
  onCancel,
  onSaved,
}: {
  initial: Inventory;
  isNew: boolean;
  onCancel: () => void;
  onSaved: (inv: Inventory, refresh: boolean) => void;
}) {
  const dialogs = useDialogs();
  const identities = useIdentities();
  const [inv, setInv] = useState<Inventory>(initial);
  const [secret, setSecret] = useState('');
  const [regions, setRegions] = useState((initial.config.regions ?? []).join(', '));
  const cfg = inv.config;
  const set = (patch: Partial<Inventory>) => setInv((x) => store.Inventory.createFrom({ ...x, ...patch }));
  const setCfg = (patch: Partial<Inventory['config']>) => setInv((x) => store.Inventory.createFrom({ ...x, config: { ...x.config, ...patch } }));
  const aws = inv.kind === 'aws';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = store.Inventory.createFrom({
      ...inv,
      name: inv.name.trim(),
      secret,
      config: {
        ...cfg,
        url: cfg.url.trim(),
        tokenId: cfg.tokenId.trim(),
        accessKeyId: cfg.accessKeyId.trim(),
        regions: regions.split(/[,\s]+/).filter(Boolean),
        // A different server needs its certificate confirmed again.
        fingerprint: cfg.url.trim() === initial.config.url ? cfg.fingerprint : '',
      },
    });
    try {
      await SaveInventory(next);
      onSaved(next, isNew);
    } catch (err) {
      dialogs.toast(`Could not save: ${errorText(err)}`, 'error');
    }
  };

  return (
    <Modal title={isNew ? `Add ${aws ? 'AWS account' : 'Proxmox server'}` : `Edit ${initial.name}`} onClose={onCancel} width="max-w-lg">
      <form onSubmit={submit} className="px-5 pb-5 pt-1 space-y-3 max-h-[72vh] overflow-y-auto">
        <Field label="Name" hint="Also the name of the folder its hosts go to.">
          <input className="input-field" value={inv.name} onChange={(e) => set({ name: e.target.value })} required />
        </Field>
        {aws ? (
          <>
            <Field label="Access key ID" hint="An IAM user or role with ec2:DescribeInstances is enough.">
              <input className="input-field font-mono" value={cfg.accessKeyId} onChange={(e) => setCfg({ accessKeyId: e.target.value })} required spellCheck={false} placeholder="AKIA…" />
            </Field>
            <Field
              label="Secret access key"
              hint={inv.hasSecret ? 'Saved in the system keychain. Type a new one to replace it.' : 'Stored in the system keychain. For temporary keys put the session token on a second line.'}
            >
              <textarea
                className="input-field font-mono min-h-[38px] py-2"
                rows={secret.includes('\n') ? 3 : 1}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                required={!inv.hasSecret}
                placeholder={inv.hasSecret ? '••••••••  saved' : ''}
                spellCheck={false}
              />
            </Field>
            <Field label="Regions" hint="Separated by commas, e.g. us-east-1, eu-central-1.">
              <input className="input-field font-mono" value={regions} onChange={(e) => setRegions(e.target.value)} required spellCheck={false} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Server URL">
              <input className="input-field font-mono" value={cfg.url} onChange={(e) => setCfg({ url: e.target.value })} required spellCheck={false} placeholder="https://pve.local:8006" />
            </Field>
            <Field label="API token ID" hint="Datacenter → Permissions → API Tokens. The PVEAuditor role is enough.">
              <input className="input-field font-mono" value={cfg.tokenId} onChange={(e) => setCfg({ tokenId: e.target.value })} required spellCheck={false} placeholder="terminyxx@pve!inventory" />
            </Field>
            <Field label="Token secret" hint={inv.hasSecret ? 'Saved in the system keychain. Type a new one to replace it.' : 'Stored in the system keychain.'}>
              <input
                className="input-field font-mono"
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                required={!inv.hasSecret}
                placeholder={inv.hasSecret ? '••••••••  saved' : ''}
              />
            </Field>
            {cfg.fingerprint && <p className="text-2xs text-gray-600 break-all">Trusted certificate: {cfg.fingerprint}</p>}
          </>
        )}

        <div className="pt-2 border-t border-white/[0.05]" />
        <p className="text-2xs text-gray-500">New hosts get this login. Windows machines are added as RDP hosts. Your later changes to a host are kept.</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="User">
            <input className="input-field font-mono" value={cfg.username} onChange={(e) => setCfg({ username: e.target.value })} spellCheck={false} disabled={!!cfg.identityId} />
          </Field>
          <Field label="Identity">
            <Select
              value={cfg.identityId}
              onChange={(v) => setCfg({ identityId: v })}
              options={[{ value: '', label: 'None' }, ...identities.map((i) => ({ value: i.id, label: `${i.name} (${i.username})` }))]}
            />
          </Field>
        </div>
        {!cfg.identityId && (
          <Field label="SSH key (optional)">
            <input className="input-field font-mono" value={cfg.keyPath} onChange={(e) => setCfg({ keyPath: e.target.value })} spellCheck={false} placeholder="~/.ssh/id_ed25519" />
          </Field>
        )}
        {aws && (
          <Field label="Address">
            <Select
              value={cfg.address || 'private'}
              onChange={(v) => setCfg({ address: v })}
              options={[
                { value: 'private', label: 'Private IP (VPN, bastion)' },
                { value: 'public', label: 'Public IP when there is one' },
              ]}
            />
          </Field>
        )}
        <Toggle checked={cfg.runningOnly} onChange={(v) => setCfg({ runningOnly: v })} label="Only machines that are running" />

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost h-8 px-3" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            {isNew ? 'Save and refresh' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
