import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { SetMasterPassword } from '../../../wailsjs/go/main/App';
import { Modal, errorText } from '../ui/Dialogs';

const MIN_LENGTH = 6;

/** Sets a new master password, or changes the current one. */
export function MasterPasswordDialog({ configured, onClose, onDone }: { configured: boolean; onClose: () => void; onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const valid = next.length >= MIN_LENGTH && next === confirm && (!configured || current.length > 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      await SetMasterPassword(current, next);
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={configured ? 'Change master password' : 'Set a master password'}
      subtitle="Unlocks Terminyxx after it locks. Stored only as an Argon2id hash; it can't be recovered."
      icon={
        <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-accent/15 text-accent ring-1 ring-inset ring-accent/25">
          <KeyRound size={16} />
        </span>
      }
      onClose={onClose}
    >
      <form className="px-5 pb-5 space-y-3" onSubmit={submit}>
        {configured && (
          <div>
            <label className="label">Current password</label>
            <input className="input-field" type="password" autoFocus value={current} onChange={(e) => (setCurrent(e.target.value), setError(null))} autoComplete="current-password" />
          </div>
        )}
        <div>
          <label className="label">New password</label>
          <input className="input-field" type="password" autoFocus={!configured} value={next} onChange={(e) => (setNext(e.target.value), setError(null))} autoComplete="new-password" />
          {tooShort && <p className="mt-1 text-2xs text-amber-300">At least {MIN_LENGTH} characters.</p>}
        </div>
        <div>
          <label className="label">Repeat new password</label>
          <input className="input-field" type="password" value={confirm} onChange={(e) => (setConfirm(e.target.value), setError(null))} autoComplete="new-password" />
          {mismatch && <p className="mt-1 text-2xs text-amber-300">The passwords don't match.</p>}
        </div>
        {error && <p className="text-[12.5px] text-red-400">{error}</p>}
        <p className="text-2xs text-gray-500">
          The lock protects access to the app window; saved hosts aren't encrypted with this password (their passwords stay in the system keychain).
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost h-8 px-3" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!valid || busy}>
            {configured ? 'Change password' : 'Set password'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
