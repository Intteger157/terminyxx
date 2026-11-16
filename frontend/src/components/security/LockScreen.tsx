import { useEffect, useRef, useState } from 'react';
import { Fingerprint, Loader2, Lock, ScanFace } from 'lucide-react';
import { UnlockApp, UnlockWithBiometrics } from '../../../wailsjs/go/main/App';
import { markActive, refreshLockStatus, useAppLock } from '../../lib/appLock';
import { useSettings } from '../../lib/settings';
import { errorText } from '../ui/Dialogs';

/**
 * Full-window lock screen. The app underneath is blurred and inert (App.tsx),
 * and the backend holds terminal output back until unlock, so nothing new
 * reaches the DOM while this is shown. Sessions stay connected.
 */
export function LockScreen({ sessions }: { sessions: number }) {
  const lock = useAppLock();
  const settings = useSettings();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'password' | 'bio' | null>(null);
  const [wait, setWait] = useState(0);
  const [shake, setShake] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const bioOffered = settings.security.lock.biometrics && lock.biometrics.available;
  const triedBio = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Count down the backend's throttling delay after failed attempts.
  useEffect(() => {
    if (lock.retryAfterMs <= 0) return;
    const until = Date.now() + lock.retryAfterMs;
    const tick = () => setWait(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    tick();
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
  }, [lock.retryAfterMs]);

  const done = () => {
    setPassword('');
    setError(null);
    markActive();
  };

  const unlockBio = async () => {
    setBusy('bio');
    setError(null);
    try {
      await UnlockWithBiometrics();
      done();
    } catch (e) {
      const msg = errorText(e);
      if (!/cancel/i.test(msg)) setError(msg);
      inputRef.current?.focus();
    } finally {
      setBusy(null);
    }
  };

  // Offer biometrics right away, once per lock.
  useEffect(() => {
    if (bioOffered && !triedBio.current) {
      triedBio.current = true;
      void unlockBio();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bioOffered]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy('password');
    try {
      await UnlockApp(password);
      done();
    } catch (err) {
      const msg = errorText(err);
      setError(msg.charAt(0).toUpperCase() + msg.slice(1));
      setShake((n) => n + 1);
      setPassword('');
      void refreshLockStatus();
    } finally {
      setBusy(null);
      inputRef.current?.focus();
    }
  };

  const BioIcon = lock.biometrics.kind === 'Touch ID' ? Fingerprint : ScanFace;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-app/70 backdrop-blur-2xl animate-fade-in drag" role="dialog" aria-modal="true" aria-label="Terminyxx is locked">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,rgb(var(--accent)/0.12),transparent_60%)]" />
      <form
        key={shake}
        onSubmit={submit}
        className={`no-drag relative w-[340px] flex flex-col items-center gap-5 px-8 py-9 rounded-3xl bg-surface-raised/80 shadow-pop ring-1 ring-white/[0.06] ${shake ? 'animate-shake' : 'animate-pop-in'}`}
      >
        <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-accent/15 text-accent ring-1 ring-inset ring-accent/25">
          <Lock size={24} />
        </span>
        <div className="text-center">
          <h2 className="text-[16px] font-semibold tracking-tight text-gray-100">Terminyxx is locked</h2>
          <p className="mt-1 text-[12.5px] text-gray-500">
            {sessions > 0 ? `${sessions} ${sessions === 1 ? 'session stays' : 'sessions stay'} connected in the background.` : 'Enter your master password to continue.'}
          </p>
        </div>

        <div className="w-full space-y-2">
          <input
            ref={inputRef}
            type="password"
            className="input-field text-center"
            placeholder="Master password"
            value={password}
            disabled={wait > 0}
            autoComplete="current-password"
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
          />
          <div className="min-h-[18px] text-center text-2xs">
            {wait > 0 ? (
              <span className="text-amber-300">Too many attempts. Try again in {wait} s.</span>
            ) : error ? (
              <span className="text-red-400">{error}</span>
            ) : null}
          </div>
          <button type="submit" className="btn-primary w-full justify-center h-9" disabled={!password || !!busy || wait > 0}>
            {busy === 'password' ? <Loader2 size={14} className="animate-spin" /> : 'Unlock'}
          </button>
          {bioOffered && (
            <button type="button" className="btn-secondary w-full justify-center h-9" onClick={unlockBio} disabled={!!busy}>
              {busy === 'bio' ? <Loader2 size={14} className="animate-spin" /> : <BioIcon size={15} />}
              Unlock with {lock.biometrics.kind}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
