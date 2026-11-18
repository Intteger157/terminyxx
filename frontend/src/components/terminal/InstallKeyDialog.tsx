import { useState } from 'react';
import { KeyRound, Loader2, Lock } from 'lucide-react';
import { Modal, errorText, useDialogs } from '../ui/Dialogs';
import { shortFingerprint, useSSHKeys } from '../../lib/sshKeys';
import type { SSHKey } from '../../lib/sshKeys';
import { InstallPublicKey } from '../../../wailsjs/go/main/App';
import type { SSHProfile, TerminalTab } from '../../types';

interface Props {
  tab: TerminalTab;
  /** The saved host of the tab, if any (to offer switching it to the key). */
  saved?: SSHProfile;
  onClose: () => void;
  onUseKey: (profile: SSHProfile, key: SSHKey) => void;
  onGenerate: () => void;
}

/** Adds one of the local public keys to ~/.ssh/authorized_keys on the tab's server. */
export function InstallKeyDialog({ tab, saved, onClose, onUseKey, onGenerate }: Props) {
  const { keys, loading } = useSSHKeys();
  const usable = keys.filter((k) => k.publicKey);
  const [picked, setPicked] = useState('');
  const [busy, setBusy] = useState(false);
  const dialogs = useDialogs();
  const key = usable.find((k) => k.path === picked) ?? usable[0];
  const target = tab.profile ? `${tab.profile.username}@${tab.profile.host}` : tab.host;

  const install = async () => {
    if (!key) return;
    setBusy(true);
    try {
      const added = await InstallPublicKey(tab.id, key.path);
      dialogs.toast(added ? `Added ${key.name}.pub to authorized_keys on ${tab.host}` : `${tab.host} already had this key`, 'success');
      onClose();
      if (saved && !saved.identityId && (saved.authType !== 'key' || saved.keyPath !== key.path)) {
        const ok = await dialogs.confirm({
          title: 'Use the key for this host?',
          message: `Log in to “${saved.name}” with ${key.name} from now on, instead of ${saved.authType === 'key' ? (saved.keyPath || 'the default keys') : 'a password'}?`,
          confirmLabel: 'Use key',
        });
        if (ok) onUseKey(saved, key);
      } else if (saved?.identityId) {
        dialogs.toast('This host uses an identity: switch the identity to the key in Settings → Identities.');
      }
    } catch (err) {
      dialogs.toast(`Could not install the key: ${errorText(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Install public key" subtitle={`Adds it to ~/.ssh/authorized_keys on ${target}.`} icon={<KeyRound size={16} />} onClose={onClose}>
      <div className="px-5 pb-5 pt-1 space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-gray-500 text-[12.5px]">
            <Loader2 size={14} className="animate-spin" /> Reading ~/.ssh…
          </div>
        ) : usable.length === 0 ? (
          <div className="text-[12.5px] text-gray-400 space-y-3">
            <p>There is no key with a readable public part in ~/.ssh yet.</p>
            <button className="btn-primary" onClick={onGenerate}>
              Generate a key
            </button>
          </div>
        ) : (
          <div className="space-y-1" role="radiogroup" aria-label="Key">
            {usable.map((k) => (
              <button
                key={k.path}
                type="button"
                role="radio"
                aria-checked={key?.path === k.path}
                onClick={() => setPicked(k.path)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  key?.path === k.path ? 'bg-accent/10 ring-1 ring-inset ring-accent/40' : 'bg-white/[0.03] hover:bg-white/[0.05]'
                }`}
              >
                <KeyRound size={14} className="text-gray-500 flex-shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[12.5px] text-gray-200">
                    <span className="font-mono truncate">{k.name}</span>
                    {k.encrypted && <Lock size={11} className="text-gray-500" />}
                    {k.comment && <span className="text-2xs text-gray-500 truncate">{k.comment}</span>}
                  </span>
                  <span className="block text-2xs text-gray-500 font-mono truncate">
                    {k.type} · {shortFingerprint(k.fingerprint)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
        <p className="text-2xs text-gray-600">
          Works over SFTP, so it also works on accounts without a shell. Windows servers keep administrators' keys in another file, which this does not change.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost h-8 px-3" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary inline-flex items-center gap-1.5" disabled={!key || busy} onClick={() => void install()}>
            {busy && <Loader2 size={13} className="animate-spin" />} Install
          </button>
        </div>
      </div>
    </Modal>
  );
}
