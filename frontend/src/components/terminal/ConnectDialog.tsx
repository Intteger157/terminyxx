import { useRef, useState } from 'react';
import { ChevronRight, Folder, FolderOpen, KeyRound, Layers, Lock, PenLine, ShieldAlert, UserRound } from 'lucide-react';
import { identitySummary, useIdentities } from '../../lib/identities';
import { DEFAULT_HOST_OPTIONS, ENCODINGS, HOST_COLORS } from '../../lib/hostOptions';
import { THEMES } from '../../lib/themes';
import { useSSHKeys } from '../../lib/sshKeys';
import type { HostOptions } from '../../types';
import { Select } from '../ui/Select';
import type { ProxySettings, SavedTunnel, SSHProfile } from '../../types';
import { HostNotesFields, sameNotes } from '../sidebar/HostNotesFields';
import type { NotesValue } from '../sidebar/HostNotesFields';
import { JumpHostSelect, TunnelEditor } from './TunnelEditor';
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
  /** Shown for a brand-new host: switches this dialog to the RDP one, carrying over what was typed. */
  onSwitchToRdp?: (carry: { host: string; folderId: string }) => void;
  /** The saved host's tags and notes. */
  notes?: NotesValue;
  /** Saves tags and notes of a saved host (called only when they changed). */
  onSaveNotes?: (id: string, v: NotesValue) => void;
}

const NO_PROXY: ProxySettings = { type: '', host: '', port: 1080, username: '', password: '', command: '' };

/** SSH | RDP selector shown at the top of both "new host" dialogs. */
export function ProtocolSwitch({ value, onChange }: { value: 'ssh' | 'rdp'; onChange: (v: 'ssh' | 'rdp') => void }) {
  return (
    <div className="flex gap-1 p-1 rounded-lg bg-white/[0.04]" role="tablist" aria-label="Protocol">
      {(['ssh', 'rdp'] as const).map((p) => (
        <button
          key={p}
          type="button"
          role="tab"
          aria-selected={value === p}
          onClick={() => value !== p && onChange(p)}
          className={`flex-1 h-7 rounded-md text-xs font-medium transition-colors ${
            value === p ? 'bg-accent/15 text-accent ring-1 ring-inset ring-accent/40' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {p === 'ssh' ? 'SSH / SFTP' : 'RDP'}
        </button>
      ))}
    </div>
  );
}

// Mount with a fresh `key` each time it opens so fields reset.
export function ConnectDialog({ initial, folders, onClose, onConnect, onSwitchToRdp, notes: initialNotes, onSaveNotes }: ConnectDialogProps) {
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
  const [x11, setX11] = useState(!!initial?.x11Forwarding);
  const [advanced, setAdvanced] = useState(allowLegacy || agentForwarding || x11);
  const [proxy, setProxy] = useState<ProxySettings>({ ...NO_PROXY, ...initial?.proxy, password: '' });
  const setProxyField = (patch: Partial<ProxySettings>) => setProxy((p) => ({ ...p, ...patch }));
  const savedProxyPassword = editing && !!initial?.proxy?.hasPassword && !proxy.clearPassword;
  const startNotes: NotesValue = initialNotes ?? { tags: [], notes: '' };
  const [notes, setNotes] = useState<NotesValue>(startNotes);
  const [sftpOnly, setSftpOnly] = useState(!!initial?.sftpOnly);
  const [jumpProfileId, setJumpProfileId] = useState(initial?.jumpProfileId ?? '');
  const [tunnels, setTunnels] = useState<SavedTunnel[]>(initial?.tunnels ?? []);
  const [network, setNetwork] = useState(!!initial?.jumpProfileId || (initial?.tunnels?.length ?? 0) > 0 || !!initial?.proxy?.type);
  const [options, setOptions] = useState<HostOptions>({ ...DEFAULT_HOST_OPTIONS, ...initial?.options });
  const setOpt = (patch: Partial<HostOptions>) => setOptions((o) => ({ ...o, ...patch }));
  const termCustomized = !!(options.color || options.startupCommands.trim() || options.encoding || options.themeId);
  const [termOpen, setTermOpen] = useState(termCustomized);
  const identities = useIdentities();
  const localKeys = useSSHKeys().keys;
  const [identityId, setIdentityId] = useState(initial?.identityId ?? '');
  const ident = identities.find((i) => i.id === identityId);
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
        name: name.trim() || `${ident ? ident.username : username.trim()}@${host.trim()}`,
        host: host.trim(),
        port: Number(port) || 22,
        // With an identity the login is the identity's; the backend applies it too.
        username: ident ? ident.username : username.trim(),
        authType: ident ? ident.authType : authType,
        password: ident ? '' : password,
        hasPassword: ident ? !!ident.hasPassword : savedPassword && !password,
        clearPassword: !ident && forgetPassword && !password,
        keyPath: ident ? ident.keyPath : keyPath.trim(),
        identityId: ident ? ident.id : '',
        options: { ...options, startupCommands: options.startupCommands.replace(/\s+$/, '') },
        folderId,
        allowLegacyAlgorithms: allowLegacy,
        agentForwarding,
        jumpProfileId,
        sftpOnly,
        x11Forwarding: x11,
        proxy:
          proxy.type === ''
            ? { ...NO_PROXY }
            : {
                ...proxy,
                host: proxy.host.trim(),
                port: Number(proxy.port) || (proxy.type === 'http' ? 3128 : 1080),
                username: proxy.username.trim(),
                command: proxy.command.trim(),
                hasPassword: savedProxyPassword && !proxy.password,
              },
        tunnels: tunnels.filter((t) => t.kind === 'dynamic' || (t.destHost.trim() && t.destPort > 0)).map((t) => ({ ...t, destHost: t.destHost.trim(), bindHost: t.bindHost.trim() })),
  });
  const saveNotes = (p: SSHProfile) => {
    if (onSaveNotes && !sameNotes(notes, startNotes)) onSaveNotes(p.id, notes);
  };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = build();
    if (saveProfile || editing) saveNotes(p);
    onConnect(p, saveProfile || editing, true);
  };
  const saveOnly = () => {
    if (!formRef.current?.reportValidity()) return;
    const p = build();
    saveNotes(p);
    onConnect(p, true, false);
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
        {onSwitchToRdp && !editing && <ProtocolSwitch value="ssh" onChange={() => onSwitchToRdp({ host: host.trim(), folderId })} />}
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

        {identities.length > 0 && (
          <Field label="Login" hint={ident ? `${identitySummary(ident)}. Edit it in Settings → Identities.` : 'Use a saved identity, or enter the user and password for this host.'}>
            <Select
              value={identityId}
              onChange={setIdentityId}
              options={[
                { value: '', label: 'Enter for this host', icon: <PenLine size={13} className="text-gray-500" /> },
                ...identities.map((i) => ({ value: i.id, label: `${i.name} (${i.username})`, icon: <UserRound size={13} className="text-gray-400" /> })),
              ]}
            />
          </Field>
        )}

        {!ident && (
          <>
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
                  list="terminyxx-key-files"
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
          </>
        )}

        <datalist id="terminyxx-key-files">
          {localKeys.map((k) => (
            <option key={k.path} value={k.path}>
              {k.name}
            </option>
          ))}
        </datalist>

        <div>
          <Toggle checked={sftpOnly} onChange={setSftpOnly} label="SFTP only (no shell access)" />
          <p className="mt-1 ml-[42px] text-2xs text-gray-600">
            For servers that allow file transfer but not a terminal. Opens the file manager instead of a shell.
          </p>
        </div>

        <div>
          <button
            type="button"
            className="flex items-center gap-1 text-[12px] text-gray-500 hover:text-gray-300 transition-colors"
            onClick={() => setAdvanced((v) => !v)}
            aria-expanded={advanced}
          >
            <ChevronRight size={13} className={`transition-transform ${advanced ? 'rotate-90' : ''}`} />
            Security options
            {(allowLegacy || agentForwarding || x11) && <ShieldAlert size={12} className="text-amber-400 ml-1" />}
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
              {!sftpOnly && (
                <div>
                  <Toggle checked={x11} onChange={setX11} label="Forward X11" />
                  <p className={`mt-1 ml-[42px] text-2xs ${x11 && !sshSec.allowX11Forwarding ? 'text-amber-300/90' : 'text-gray-600'}`}>
                    {sshSec.allowX11Forwarding
                      ? `Runs graphical programs from the server on your local X server (${sshSec.x11Display || 'VcXsrv or XQuartz'}). The server can see what happens in those windows.`
                      : 'X11 forwarding is turned off in Settings → Security, so this has no effect until you allow it there.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <button
            type="button"
            className="flex items-center gap-1 text-[12px] text-gray-500 hover:text-gray-300 transition-colors"
            onClick={() => setNetwork((v) => !v)}
            aria-expanded={network}
          >
            <ChevronRight size={13} className={`transition-transform ${network ? 'rotate-90' : ''}`} />
            Proxy, jump host and tunnels
            {(jumpProfileId || tunnels.length > 0 || proxy.type) && (
              <span className="ml-1 text-2xs text-accent">
                {[proxy.type && 'proxy', jumpProfileId && 'jump', tunnels.length > 0 && `${tunnels.length} tunnel${tunnels.length > 1 ? 's' : ''}`].filter(Boolean).join(', ')}
              </span>
            )}
          </button>
          {network && (
            <div className="mt-3 space-y-3 pl-4 animate-fade-in">
              <Field
                label="Proxy"
                hint={
                  jumpProfileId
                    ? 'With a jump host, the proxy of the first jump host is used, not this one.'
                    : proxy.type === 'command'
                      ? 'Runs on this computer for every connect; %h, %p and %r become host, port and user (like OpenSSH ProxyCommand).'
                      : 'For networks that only allow outgoing connections through a proxy.'
                }
              >
                <Select
                  value={proxy.type}
                  onChange={(v) => setProxyField({ type: v, port: proxy.port || (v === 'http' ? 3128 : 1080) })}
                  options={[
                    { value: '', label: 'Direct connection' },
                    { value: 'socks5', label: 'SOCKS5 proxy' },
                    { value: 'http', label: 'HTTP proxy (CONNECT)' },
                    { value: 'command', label: 'ProxyCommand' },
                  ]}
                />
              </Field>
              {(proxy.type === 'socks5' || proxy.type === 'http') && (
                <>
                  <div className="grid grid-cols-[1fr_88px] gap-2">
                    <Field label="Proxy host">
                      <input className="input-field font-mono" value={proxy.host} onChange={(e) => setProxyField({ host: e.target.value })} required spellCheck={false} placeholder="proxy.corp.local" />
                    </Field>
                    <Field label="Port">
                      <input className="input-field font-mono" type="number" min={1} max={65535} value={proxy.port} onChange={(e) => setProxyField({ port: Number(e.target.value) })} required />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Proxy user (optional)">
                      <input className="input-field font-mono" value={proxy.username} onChange={(e) => setProxyField({ username: e.target.value })} spellCheck={false} />
                    </Field>
                    <Field label="Proxy password">
                      <div className="relative">
                        <input
                          className="input-field pr-16"
                          type="password"
                          value={proxy.password}
                          placeholder={savedProxyPassword ? '••••  saved' : ''}
                          onChange={(e) => setProxyField({ password: e.target.value })}
                        />
                        {savedProxyPassword && !proxy.password && (
                          <button
                            type="button"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 px-2 rounded-md text-2xs text-gray-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={() => setProxyField({ clearPassword: true })}
                          >
                            Forget
                          </button>
                        )}
                      </div>
                    </Field>
                  </div>
                </>
              )}
              {proxy.type === 'command' && (
                <Field label="Command">
                  <input
                    className="input-field font-mono"
                    value={proxy.command}
                    onChange={(e) => setProxyField({ command: e.target.value })}
                    required
                    spellCheck={false}
                    placeholder="cloudflared access ssh --hostname %h"
                  />
                </Field>
              )}
              <Field label="Connect through" hint="Reach this host via another saved host (like ssh -J).">
                <JumpHostSelect value={jumpProfileId} selfId={initial?.id} onChange={setJumpProfileId} />
              </Field>
              <div>
                <span className="label">Port forwarding</span>
                <TunnelEditor tunnels={tunnels} onChange={setTunnels} />
                <p className="mt-1.5 text-2xs text-gray-600">Tunnels marked “Start with host” open when you connect. Others can be started from the status bar.</p>
              </div>
            </div>
          )}
        </div>

        <div>
          <button
            type="button"
            className="flex items-center gap-1 text-[12px] text-gray-500 hover:text-gray-300 transition-colors"
            onClick={() => setTermOpen((v) => !v)}
            aria-expanded={termOpen}
          >
            <ChevronRight size={13} className={`transition-transform ${termOpen ? 'rotate-90' : ''}`} />
            Terminal
            {options.color && <span className="ml-1 w-2 h-2 rounded-full" style={{ background: HOST_COLORS.find((c) => c.id === options.color)?.value }} />}
            {termCustomized && !options.color && <span className="ml-1 text-2xs text-accent">customized</span>}
          </button>
          {termOpen && (
            <div className="mt-3 space-y-3 pl-4 animate-fade-in">
              <div>
                <span className="label">Color tag</span>
                <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Color tag">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!options.color}
                    title="No color"
                    className={`h-6 px-2 rounded-md text-2xs ${!options.color ? 'bg-white/[0.09] text-gray-200' : 'text-gray-500 hover:text-gray-300'}`}
                    onClick={() => setOpt({ color: '' })}
                  >
                    None
                  </button>
                  {HOST_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={options.color === c.id}
                      aria-label={c.label}
                      title={c.label}
                      className={`w-6 h-6 rounded-full transition-transform ${options.color === c.id ? 'ring-2 ring-offset-2 ring-offset-surface-raised scale-110' : 'opacity-70 hover:opacity-100'}`}
                      style={{ background: c.value, ['--tw-ring-color' as string]: c.value }}
                      onClick={() => setOpt({ color: c.id })}
                    />
                  ))}
                </div>
                <p className="mt-1.5 text-2xs text-gray-600">Marks this host's tabs and panes, for example red for production.</p>
              </div>
              {!sftpOnly && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Theme">
                      <Select
                        value={options.themeId}
                        onChange={(v) => setOpt({ themeId: v })}
                        options={[{ value: '', label: 'App theme' }, ...THEMES.map((t) => ({ value: t.id, label: t.name }))]}
                      />
                    </Field>
                    <Field label="Encoding">
                      <Select value={options.encoding} onChange={(v) => setOpt({ encoding: v })} options={ENCODINGS} />
                    </Field>
                  </div>
                  <Field label="Run after login" hint="One command per line, typed into the shell after every connect and reconnect.">
                    <textarea
                      className="input-field font-mono min-h-[64px] py-2 resize-y"
                      rows={3}
                      value={options.startupCommands}
                      onChange={(e) => setOpt({ startupCommands: e.target.value })}
                      placeholder={'sudo -i\ncd /var/www'}
                      spellCheck={false}
                    />
                  </Field>
                </>
              )}
            </div>
          )}
        </div>

        {(editing || saveProfile) && <HostNotesFields value={notes} onChange={setNotes} />}

        <div className="pt-1 border-t border-white/[0.05]" />

        {!editing && <Toggle checked={saveProfile} onChange={setSaveProfile} label="Save host" />}
        {(editing || saveProfile) && (
          <div className="grid grid-cols-2 gap-2 animate-fade-in">
            <Field label="Name">
              <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder={`${(ident ? ident.username : username) || 'user'}@${host || 'host'}`} />
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
