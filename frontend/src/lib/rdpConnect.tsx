import { ShieldAlert } from 'lucide-react';
import { RDPOpen } from '../../wailsjs/go/main/App';
import type { main } from '../../wailsjs/go/models';
import type { RDPProfile } from '../types';
import type { useDialogs } from '../components/ui/Dialogs';
import { errorText } from '../components/ui/Dialogs';
import { ConnectCancelled } from './connect';

type Dialogs = ReturnType<typeof useDialogs>;

// Error strings from internal/rdpgw (UntrustedError).
const CERT_UNKNOWN = 'RDPCERT_UNKNOWN|';
const CERT_CHANGED = 'RDPCERT_CHANGED|';

interface CertInfo {
  dest: string;
  fingerprint: string;
  subject: string;
  issuer: string;
  notAfter: string;
  reason: string;
  changed: boolean;
}

function parseCert(msg: string): CertInfo | null {
  const at = Math.max(msg.indexOf(CERT_UNKNOWN), msg.indexOf(CERT_CHANGED));
  if (at < 0) return null;
  const [kind, dest, fingerprint, subject, issuer, notAfter, reason] = msg.slice(at).split('|');
  return { dest, fingerprint, subject, issuer, notAfter, reason, changed: kind === 'RDPCERT_CHANGED' };
}

function confirmCert(dialogs: Dialogs, c: CertInfo): Promise<boolean> {
  const row = (label: string, value: string) => (
    <div className="grid grid-cols-[88px_1fr] gap-2">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-200 break-all font-mono text-[11.5px]">{value}</span>
    </div>
  );
  const expires = new Date(c.notAfter);
  return dialogs.confirm({
    title: c.changed ? 'Server certificate changed' : 'Unknown server certificate',
    danger: c.changed,
    focusCancel: c.changed,
    width: 'max-w-xl',
    confirmLabel: 'Trust and connect',
    message: (
      <div className="space-y-3 text-[12.5px]">
        <div className="flex gap-2.5 text-gray-300">
          <ShieldAlert size={15} className={`flex-shrink-0 mt-0.5 ${c.changed ? 'text-red-400' : 'text-amber-400'}`} />
          <p>
            {c.changed
              ? `${c.dest} presents a different certificate than the one you trusted. Servers renew self-signed certificates from time to time, but this can also mean someone is intercepting the connection.`
              : `The certificate of ${c.dest} is ${c.reason}. This is normal for most Windows servers. Check the fingerprint if you can.`}
          </p>
        </div>
        <div className="space-y-1.5 rounded-lg bg-black/30 ring-1 ring-inset ring-white/[0.06] px-3 py-2">
          {row('Subject', c.subject || '—')}
          {row('Issuer', c.issuer || '—')}
          {row('Expires', isNaN(expires.getTime()) ? c.notAfter : expires.toLocaleDateString())}
          {row('SHA-256', c.fingerprint)}
        </div>
      </div>
    ),
  });
}

/**
 * Prepares a built-in RDP session for tab `tabId`: trusts the server
 * certificate after asking, and asks for a password when none is saved.
 * Throws ConnectCancelled if the user backs out.
 */
export async function openRdpSession(
  tabId: string,
  profile: RDPProfile,
  dialogs: Dialogs,
  password = ''
): Promise<main.RDPSession> {
  // Ask before RDPOpen: its ticket is only valid for a minute.
  if (!password && !profile.hasPassword) {
    const pw = await dialogs.prompt({
      title: 'Password',
      label: `Password for ${profile.username ? `${profile.username}@` : ''}${profile.host}`,
      password: true,
      confirmLabel: 'Connect',
    });
    if (pw === null) throw new ConnectCancelled();
    password = pw;
  }
  let accept = '';
  for (;;) {
    let session: main.RDPSession;
    try {
      session = await RDPOpen(tabId, profile.id, password, accept);
    } catch (err) {
      const msg = errorText(err);
      const cert = parseCert(msg);
      if (cert && !accept) {
        if (!(await confirmCert(dialogs, cert))) throw new ConnectCancelled();
        accept = cert.fingerprint;
        continue;
      }
      if (msg.includes('app is locked')) throw new ConnectCancelled();
      throw err;
    }
    return session;
  }
}
