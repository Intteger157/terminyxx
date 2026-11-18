import { useState } from 'react';
import { FolderOpen, KeyRound, Lock, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { Section } from './SettingsDialog';
import { Field } from '../terminal/ConnectDialog';
import { errorText, useDialogs } from '../ui/Dialogs';
import { deleteIdentity, identitySummary, saveIdentity, useIdentities } from '../../lib/identities';
import { SelectKeyFile } from '../../../wailsjs/go/main/App';
import type { Identity } from '../../types';

/** Fired after identities change so open dialogs and the sidebar reload hosts. */
const LIBRARY_CHANGED = 'terminyxx:library-changed';

export function IdentitiesSection() {
  const identities = useIdentities();
  const dialogs = useDialogs();
  const [editing, setEditing] = useState<Identity | null>(null);

  const remove = async (i: Identity) => {
    const ok = await dialogs.confirm({
      title: `Delete identity “${i.name}”`,
      message:
        (i.hosts ?? 0) > 0
          ? `${i.hosts} host${i.hosts === 1 ? '' : 's'} use it. They keep working: each gets its own copy of the user name, key and password.`
          : 'No hosts use it.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteIdentity(i.id);
      window.dispatchEvent(new Event(LIBRARY_CHANGED));
    } catch (e) {
      dialogs.toast(`Could not delete: ${errorText(e)}`, 'error');
    }
  };

  const add = () => setEditing({ id: crypto.randomUUID(), name: '', username: '', authType: 'password', password: '', keyPath: '' });

  return (
    <div className="space-y-6">
      <Section
        title="Identities"
        action={
          !editing && (
            <button className="btn-secondary h-7 px-2.5 inline-flex items-center gap-1.5" onClick={add}>
              <Plus size={13} /> New identity
            </button>
          )
        }
      >
        <p className="text-[12.5px] text-gray-400 leading-relaxed">
          An identity is a login (user name with a password or key) that many hosts can share. Pick it in a host's settings; when the password changes, update it here once.
        </p>

        {editing && (
          <IdentityForm
            key={editing.id}
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={async (i) => {
              try {
                await saveIdentity(i);
                setEditing(null);
                window.dispatchEvent(new Event(LIBRARY_CHANGED));
              } catch (e) {
                dialogs.toast(`Identity not saved: ${errorText(e)}`, 'error');
              }
            }}
          />
        )}

        <div className="mt-4 space-y-1">
          {identities.length === 0 && !editing && <p className="text-[12.5px] text-gray-600">No identities yet.</p>}
          {identities.map((i) => (
            <div key={i.id} className="group flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.05]">
              <UserRound size={15} className="text-gray-500 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] text-gray-200 truncate">{i.name}</div>
                <div className="text-2xs text-gray-500 font-mono truncate">{identitySummary(i)}</div>
              </div>
              <span className="text-2xs text-gray-500 flex-shrink-0">
                {i.hosts ?? 0} host{i.hosts === 1 ? '' : 's'}
              </span>
              <button className="btn-ghost h-7 w-7 p-0 justify-center" title="Edit" aria-label={`Edit ${i.name}`} onClick={() => setEditing({ ...i, password: '' })}>
                <Pencil size={13} />
              </button>
              <button className="btn-ghost h-7 w-7 p-0 justify-center hover:text-red-300" title="Delete" aria-label={`Delete ${i.name}`} onClick={() => void remove(i)}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function IdentityForm({ initial, onSave, onCancel }: { initial: Identity; onSave: (i: Identity) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial.name);
  const [username, setUsername] = useState(initial.username);
  const [authType, setAuthType] = useState(initial.authType || 'password');
  const [password, setPassword] = useState('');
  const [keyPath, setKeyPath] = useState(initial.keyPath);
  const [forget, setForget] = useState(false);
  const saved = !!initial.hasPassword && !forget;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...initial,
      name: name.trim() || username.trim(),
      username: username.trim(),
      authType,
      password: authType === 'password' ? password : '',
      clearPassword: (forget && !password) || (authType === 'key' && !!initial.hasPassword),
      keyPath: authType === 'key' ? keyPath.trim() : '',
    });
  };

  const browse = async () => {
    try {
      const p = await SelectKeyFile();
      if (p) setKeyPath(p);
    } catch {
      // cancelled
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 p-4 rounded-xl border border-border bg-black/20 space-y-3 animate-fade-in">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Name">
          <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Production deploy" autoFocus />
        </Field>
        <Field label="Username">
          <input className="input-field font-mono" value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="deploy" spellCheck={false} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-1 p-1 bg-black/30 rounded-xl border border-border">
        {(
          [
            ['password', 'Password', <Lock key="p" size={13} />],
            ['key', 'SSH key', <KeyRound key="k" size={13} />],
          ] as const
        ).map(([value, label, icon]) => (
          <button
            key={value}
            type="button"
            className={`flex items-center justify-center gap-1.5 h-7 text-[12.5px] font-medium rounded-lg transition-all ${
              authType === value ? 'bg-white/[0.09] text-gray-100' : 'text-gray-500 hover:text-gray-300'
            }`}
            onClick={() => setAuthType(value)}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
      {authType === 'password' ? (
        <Field label="Password" hint={saved ? 'Saved in the system keychain. Type a new one to replace it.' : 'Stored in the system keychain. Leave empty to be asked when connecting.'}>
          <div className="relative">
            <input className="input-field pr-24" type="password" value={password} placeholder={saved ? '••••••••  saved' : ''} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            {saved && !password && (
              <button type="button" className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 px-2 rounded-md text-2xs text-gray-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => setForget(true)}>
                Forget
              </button>
            )}
          </div>
        </Field>
      ) : (
        <Field label="Private key" hint="Leave empty to use ssh-agent and the default keys in ~/.ssh">
          <div className="flex gap-2">
            <input className="input-field font-mono" value={keyPath} onChange={(e) => setKeyPath(e.target.value)} placeholder="~/.ssh/id_ed25519" spellCheck={false} />
            <button type="button" className="btn-secondary h-9 px-2.5 flex-shrink-0" onClick={browse} title="Browse">
              <FolderOpen size={14} />
            </button>
          </div>
        </Field>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost h-8 px-3" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          Save identity
        </button>
      </div>
    </form>
  );
}
