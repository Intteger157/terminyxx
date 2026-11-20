import { useEffect, useState } from 'react';
import { Copy, KeyRound, Loader2, Lock, Plus, RefreshCw, Server } from 'lucide-react';
import { Section } from './SettingsDialog';
import { Field } from '../terminal/ConnectDialog';
import { errorText, useDialogs } from '../ui/Dialogs';
import { copyText } from '../../lib/clipboard';
import { shortFingerprint, suggestKeyName, useSSHKeys } from '../../lib/sshKeys';
import type { SSHKey } from '../../lib/sshKeys';
import { GenerateSSHKey } from '../../../wailsjs/go/main/App';
import { updateSecurity, useSettings } from '../../lib/settings';
import type { AgentSource } from '../../lib/settings';
import { usePlatform } from '../../lib/hosts';
import { Select } from '../ui/Select';

export function KeysSection() {
  const { keys, agent, loading, error, reload } = useSSHKeys();
  const dialogs = useDialogs();
  const [generating, setGenerating] = useState(false);

  const copyPub = async (line: string) => {
    await copyText(line);
    dialogs.toast('Public key copied', 'success');
  };

  return (
    <div className="space-y-6">
      <Section
        title="Keys in ~/.ssh"
        action={
          <div className="flex items-center gap-1">
            <button className="btn-ghost h-7 w-7 p-0 justify-center" title="Refresh" aria-label="Refresh" onClick={() => void reload()}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
            {!generating && (
              <button className="btn-secondary h-7 px-2.5 inline-flex items-center gap-1.5" onClick={() => setGenerating(true)}>
                <Plus size={13} /> Generate key
              </button>
            )}
          </div>
        }
      >
        <p className="text-[12.5px] text-gray-400 leading-relaxed">
          Keys here can be picked in a host's settings. To log in with a key, its public part must be on the server: connect with a password once, then run <b>Install SSH public key on this server</b> from the command palette.
        </p>

        {generating && (
          <GenerateForm
            keys={keys}
            onCancel={() => setGenerating(false)}
            onDone={(k) => {
              setGenerating(false);
              void reload();
              dialogs.toast(`Created ${k.name} and ${k.name}.pub`, 'success');
            }}
          />
        )}

        {error && <p className="mt-3 text-[12.5px] text-red-300">{error}</p>}
        <div className="mt-4 space-y-1">
          {!loading && keys.length === 0 && !generating && <p className="text-[12.5px] text-gray-600">No keys yet. Generate one to log in without a password.</p>}
          {keys.map((k) => (
            <KeyRow key={k.path} k={k} onCopy={copyPub} />
          ))}
        </div>
      </Section>

      <Section title="SSH agent">
        <AgentPicker onChanged={() => window.setTimeout(() => void reload(), 300)} />
        {agent === null ? (
          <p className="text-[12.5px] text-gray-600">Could not ask the agent.</p>
        ) : !agent.running ? (
          <p className="text-[12.5px] text-gray-500 leading-relaxed">
            No agent answered. On Windows, start the “OpenSSH Authentication Agent” service or Pageant; on macOS, the system agent starts on its own. 1Password and other agents work once their SSH agent is turned on.
          </p>
        ) : agent.keys.length === 0 ? (
          <p className="text-[12.5px] text-gray-500">
            {agent.source || 'The agent'} is running but holds no keys. Add one with <code className="font-mono">ssh-add</code> (or in Pageant, Add Key).
          </p>
        ) : (
          <div className="space-y-1">
            <p className="text-[12.5px] text-gray-400 mb-2">
              Keys from <b className="font-medium text-gray-300">{agent.source || 'the agent'}</b>. Hosts without a key file try these first.
            </p>
            {agent.keys.map((k) => (
              <div key={k.fingerprint} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03]">
                <Server size={14} className="text-gray-500 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] text-gray-200 truncate">{k.comment || k.type}</div>
                  <div className="text-2xs text-gray-500 font-mono truncate" title={k.fingerprint}>
                    {k.type} · {shortFingerprint(k.fingerprint)}
                  </div>
                </div>
                <button className="btn-ghost h-7 w-7 p-0 justify-center" title="Copy public key" aria-label="Copy public key" onClick={() => void copyPub(k.publicKey)}>
                  <Copy size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

const AGENT_LABELS: Record<AgentSource, string> = {
  auto: 'Automatic',
  openssh: 'OpenSSH agent',
  pageant: 'Pageant (PuTTY)',
  custom: 'Other (socket or pipe)',
};

/** Which agent keys come from; the backend applies it when settings are saved. */
function AgentPicker({ onChanged }: { onChanged: () => void }) {
  const ssh = useSettings().security.ssh;
  const platform = usePlatform();
  const [path, setPath] = useState(ssh.agentPath);
  useEffect(() => setPath(ssh.agentPath), [ssh.agentPath]);
  const sources = (Object.keys(AGENT_LABELS) as AgentSource[]).filter((s) => s !== 'pageant' || platform !== 'darwin' || ssh.agent === 'pageant');
  const commitPath = () => {
    if (path.trim() === ssh.agentPath) return;
    updateSecurity('ssh', { agentPath: path.trim() });
    onChanged();
  };
  const hint =
    ssh.agent === 'auto'
      ? platform === 'windows'
        ? 'Uses $SSH_AUTH_SOCK or the OpenSSH agent (also where 1Password and Bitwarden serve keys), then Pageant: the first one that holds keys.'
        : 'Uses $SSH_AUTH_SOCK, then 1Password’s agent if it is on.'
      : ssh.agent === 'custom'
        ? platform === 'windows'
          ? String.raw`A named pipe such as \\.\pipe\openssh-ssh-agent.`
          : 'A unix socket, e.g. ~/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock.'
        : '';
  return (
    <div className="mb-4 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Get keys from">
          <Select
            value={ssh.agent}
            options={sources.map((s) => ({ value: s, label: AGENT_LABELS[s] }))}
            onChange={(v) => {
              updateSecurity('ssh', { agent: v as AgentSource });
              onChanged();
            }}
          />
        </Field>
        {ssh.agent === 'custom' && (
          <Field label="Path">
            <input
              className="input-field font-mono"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              onBlur={commitPath}
              onKeyDown={(e) => e.key === 'Enter' && commitPath()}
              placeholder={platform === 'windows' ? String.raw`\\.\pipe\…` : '~/…/agent.sock'}
              spellCheck={false}
            />
          </Field>
        )}
      </div>
      {hint && <p className="text-2xs text-gray-600 leading-relaxed">{hint}</p>}
    </div>
  );
}

function KeyRow({ k, onCopy }: { k: SSHKey; onCopy: (line: string) => void }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.05]">
      <KeyRound size={15} className="text-gray-500 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[12.5px] text-gray-200">
          <span className="truncate font-mono">{k.name}</span>
          {k.encrypted && (
            <span title="Protected by a passphrase">
              <Lock size={11} className="text-gray-500" />
            </span>
          )}
          {k.comment && <span className="text-2xs text-gray-500 truncate">{k.comment}</span>}
        </div>
        <div className="text-2xs text-gray-500 font-mono truncate" title={k.fingerprint || k.path}>
          {k.type ? `${k.type} · ${shortFingerprint(k.fingerprint)}` : 'public key unknown (no .pub file)'}
        </div>
      </div>
      <button
        className="btn-ghost h-7 w-7 p-0 justify-center disabled:opacity-30"
        title="Copy public key"
        aria-label={`Copy public key of ${k.name}`}
        disabled={!k.publicKey}
        onClick={() => onCopy(k.publicKey)}
      >
        <Copy size={13} />
      </button>
    </div>
  );
}

function GenerateForm({ keys, onCancel, onDone }: { keys: SSHKey[]; onCancel: () => void; onDone: (k: SSHKey) => void }) {
  const dialogs = useDialogs();
  const [name, setName] = useState(() => suggestKeyName(keys));
  const [comment, setComment] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const mismatch = pass !== pass2 && pass2.length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pass !== pass2) return dialogs.toast('The passphrases do not match.', 'error');
    setBusy(true);
    try {
      onDone(await GenerateSSHKey(name.trim(), comment.trim(), pass));
    } catch (err) {
      dialogs.toast(`Key not created: ${errorText(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 p-4 rounded-xl border border-border bg-black/20 space-y-3 animate-fade-in">
      <p className="text-[12.5px] text-gray-400">A new Ed25519 key: short, fast and supported by every current SSH server.</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="File name" hint="Saved in ~/.ssh">
          <input className="input-field font-mono" value={name} onChange={(e) => setName(e.target.value)} required spellCheck={false} autoFocus />
        </Field>
        <Field label="Comment" hint="Shown on servers next to the key">
          <input className="input-field" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="me@laptop" spellCheck={false} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Passphrase" hint="Optional. Asked when the key is used.">
          <input className="input-field" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Repeat passphrase">
          <input className={`input-field ${mismatch ? 'border-red-400/60' : ''}`} type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost h-8 px-3" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary inline-flex items-center gap-1.5" disabled={busy || mismatch}>
          {busy && <Loader2 size={13} className="animate-spin" />} Generate
        </button>
      </div>
    </form>
  );
}
