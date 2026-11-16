import { useRef, useState } from 'react';
import { ChevronRight, Folder, FolderOpen, KeyRound, Layers, Lock, ShieldAlert } from 'lucide-react';
import { Select } from '../ui/Select';
import type { SSHProfile } from '../../types';
import { Modal, useDialogs } from '../ui/Dialogs';
import { confirmAgentForwarding } from '../security/securityPrompts';
import { useSettings } from '../../lib/settings';
import { SelectKeyFile } from '../../../wailsjs/go/main/App';

interface ConnectDialogProps {
  initial?: Partial<SSHProfile>;
  folders: { id: string; label: string; depth: number }[];
  onClose: () => void;
  /** connect=false means "save only" (edit mode). */
  onConnect: (profile: SSHProfile, save: boolean, connect: boolean) => void;
}

// Mount with a fresh `key` each time it opens so fields reset.
export function ConnectDialog({ initial, folders, onClose, onConnect }: ConnectDialogProps) {
  const editing = !!initial?.id;
  const [name, setName] = useState(initial?.name ?? '');
  const [host, setHost] = useState(initial?.host ?? '');
  const [port, setPort] = useState(initial?.port ?? 22);
  const [username, setUsername] = useState(initial?.username ?? '');
  const [authType, setAuthType] = useState<string>(initial?.authType ?? 'password');
  const [password, setPassword] = useState(initial?.password ?? '');
  const [keyPath, setKeyPath] = useState(initial?.keyPath ?? '');
  const [saveProfile, setSaveProfile] = useState(!editing);
  const [folderId, setFolderId] = useState(initial?.folderId ?? '');
  const [forgetPassword, setForgetPassword] = useState(false);
  const savedPassword = editing && !!initial?.hasPassword && !forgetPassword;
  const [allowLegacy, setAllowLegacy] = useState(!!initial?.allowLegacyAlgorithms);
  const [agentForwarding, setAgentForwarding] = useState(!!initial?.agentForwarding);
  const [advanced, setAdvanced] = useState(allowLegacy || agentForwarding);
  const dialogs = useDialogs();
  const sshSec = useSettings().security.ssh;

  const toggleAgentForwarding = async (on: boolean) => {
    if (on && !(await confirmAgentForwarding(dialogs, host.trim()))) return;
    setAgentForwarding(on);
  };

  // Prefilled from quick connect: jump straight to the first empty field.
  const focus = !initial?.host ? 'host' : !initial?.username ? 'username' : 'password';

  const formRef = useRef<HTMLFormElement>(null);
  const build = (): SSHProfile => ({
        id: initial?.id ?? crypto.randomUUID(),
        name: name.trim() || `${username}@${host}`,
        host: host.trim(),
        port: Number(port) || 22,
        username: username.trim(),
        authType,
        password,
        hasPassword: savedPassword && !password,
        clearPassword: forgetPassword && !password,
        keyPath: keyPath.trim(),
        folderId,
        allowLegacyAlgorithms: allowLegacy,
        agentForwarding,
  });
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConnect(build(), saveProfile || editing, true);
  };
  const saveOnly = () => {
    if (formRef.current?.reportValidity()) onConnect(build(), true, false);
  };

  const browseKey = async () => {
    try {
      const p = await SelectKeyFile();
      if (p) setKeyPath(p);
    } catch {
      // dialog cancelled
    }
  };

  return (
    <Modal
      title={editing ? `Edit ${initial?.name}` : 'New SSH connection'}
      subtitle={editing ? 'Changes are saved when you connect.' : 'Connect over SSH and optionally save the host.'}
      onClose={onClose}
    >
      <form ref={formRef} onSubmit={handleSubmit} className="px-5 pb-5 pt-1 space-y-4">
        <div className="grid grid-cols-[1fr_88px] gap-2">
          <Field label="Host">
            <input
              className="input-field font-mono"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              required
              autoFocus={focus === 'host'}
              placeholder="192.168.1.10 or example.com"
              spellCheck={false}
            />
          </Field>
          <Field label="Port">
            <input className="input-field font-mono" type="number" min={1} max={65535} value={port} onChange={(e) => setPort(Number(e.target.value))} required />
          </Field>
        </div>

        <Field label="Username">
          <input
            className="input-field font-mono"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus={focus === 'username'}
            placeholder="root"
            spellCheck={false}
          />
        </Field>

        <div>
          <span className="label">Authentication</span>
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
                  authType === value ? 'bg-white/[0.09] text-gray-100 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]' : 'text-gray-500 hover:text-gray-300'
                }`}
                onClick={() => setAuthType(value)}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </div>

        {authType === 'password' ? (
          <Field
            label="Password"
            hint={
              savedPassword
                ? 'Saved in the system keychain. Type a new one to replace it.'
                : saveProfile || editing
                  ? 'Stored in the system keychain, not in the app database.'
                  : undefined
            }
          >
            <div className="relative">
              <input
                className="input-field pr-24"
                type="password"
                value={password}
                autoFocus={focus === 'password'}
                placeholder={savedPassword ? '••••••••  saved' : ''}
                onChange={(e) => setPassword(e.target.value)}
              />
              {savedPassword && !password && (
                <button
                  type="button"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 px-2 rounded-md text-2xs text-gray-400 hover:text-red-300 hover:bg-red-500/10"
                  onClick={() => setForgetPassword(true)}
                >
                  Forget
                </button>
              )}
            </div>
          </Field>
        ) : (
          <Field label="Private key" hint="Leave empty to use the default keys in ~/.ssh">
            <div className="flex gap-2">
              <input
                className="input-field font-mono"
                value={keyPath}
                onChange={(e) => setKeyPath(e.target.value)}
                placeholder="~/.ssh/id_ed25519"
                spellCheck={false}
              />
              <button type="button" className="btn-secondary h-9 px-2.5 flex-shrink-0" onClick={browseKey} title="Browse">
                <FolderOpen size={14} />
              </button>
            </div>
          </Field>
        )}

        <div>
          <button
            type="button"
            className="flex items-center gap-1 text-[12px] text-gray-500 hover:text-gray-300 transition-colors"
            onClick={() => setAdvanced((v) => !v)}
            aria-expanded={advanced}
          >
            <ChevronRight size={13} className={`transition-transform ${advanced ? 'rotate-90' : ''}`} />
            Security options
            {(allowLegacy || agentForwarding) && <ShieldAlert size={12} className="text-amber-400 ml-1" />}
          </button>
          {advanced && (
            <div className="mt-3 space-y-3 pl-4 animate-fade-in">
              <div>
                <Toggle checked={allowLegacy} onChange={setAllowLegacy} label="Allow legacy algorithms" />
                <p className="mt-1 ml-[42px] text-2xs text-gray-600">
                  {sshSec.modernAlgorithmsOnly
                    ? 'SHA-1 key exchange and host keys, CBC ciphers. Only for old devices that need them.'
                    : 'Legacy algorithms are currently allowed for all hosts (Settings → Security).'}
                </p>
              </div>
              <div>
                <Toggle checked={agentForwarding} onChange={(v) => void toggleAgentForwarding(v)} label="Forward SSH agent" />
                <p className={`mt-1 ml-[42px] text-2xs ${agentForwarding && !sshSec.allowAgentForwarding ? 'text-amber-300/90' : 'text-gray-600'}`}>
                  {sshSec.allowAgentForwarding
                    ? 'The server can use your local SSH keys while you are connected.'
                    : 'Agent forwarding is turned off in Settings → Security, so this has no effect until you allow it there.'}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="pt-1 border-t border-white/[0.05]" />

        {!editing && <Toggle checked={saveProfile} onChange={setSaveProfile} label="Save host" />}
        {(editing || saveProfile) && (
          <div className="grid grid-cols-2 gap-2 animate-fade-in">
            <Field label="Name">
              <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder={`${username || 'user'}@${host || 'host'}`} />
            </Field>
            <Field label="Folder">
              <Select
                value={folderId}
                onChange={setFolderId}
                options={[
                  { value: '', label: 'Top level', icon: <Layers size={13} className="text-gray-500" /> },
                  ...folders.map((f) => ({
                    value: f.id,
                    label: f.label,
                    depth: f.depth,
                    icon: <Folder size={13} className="text-gray-400" />,
                  })),
                ]}
              />
            </Field>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost h-8 px-3" onClick={onClose}>
            Cancel
          </button>
          {editing && (
            <button type="button" className="btn-secondary" onClick={saveOnly}>
              Save
            </button>
          )}
          <button type="submit" className="btn-primary">
            {editing ? 'Save & connect' : 'Connect'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-2xs text-gray-600">{hint}</p>}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none text-[12.5px] text-gray-300">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-8 h-[18px] rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-white/[0.12]'}`}
      >
        <span className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[14px]' : ''}`} />
      </button>
      {label}
    </label>
  );
}
