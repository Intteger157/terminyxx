import { SSHConnect } from '../../wailsjs/go/main/App';
import type { SSHProfile } from '../types';
import type { useDialogs } from '../components/ui/Dialogs';
import { confirmChangedHostKey, confirmNewHostKey } from '../components/security/securityPrompts';

type Dialogs = ReturnType<typeof useDialogs>;

export class ConnectCancelled extends Error {}

// Error strings from the Go side (see internal/connection).
const HOSTKEY_UNKNOWN = 'HOSTKEY_UNKNOWN|';
const HOSTKEY_MISMATCH = 'HOSTKEY_MISMATCH|';
const PASSPHRASE = 'KEY_PASSPHRASE_REQUIRED|';
const LEGACY = 'LEGACY_ALGORITHMS_REQUIRED|';
const LOCKED = 'app is locked';

export interface ConnectResult {
  /** A password the user typed during this connect, and whether to keep it. */
  typedPassword?: string;
  rememberPassword: boolean;
  /** The user allowed legacy algorithms for this host during the connect. */
  allowedLegacy?: boolean;
}

/**
 * Connects tab `id`, walking the user through password, host key and key
 * passphrase prompts. Throws ConnectCancelled if the user backs out.
 */
export async function connectWithPrompts(id: string, profile: SSHProfile, dialogs: Dialogs): Promise<ConnectResult> {
  const result: ConnectResult = { rememberPassword: false };
  const target = `${profile.username}@${profile.host}`;

  const askPassword = async (retry: boolean) => {
    let remember = false;
    const pw = await dialogs.prompt({
      title: retry ? 'Wrong password' : 'Password',
      label: retry ? `Try the password for ${target} again:` : `Password for ${target}:`,
      password: true,
      confirmLabel: 'Connect',
      checkbox: profile.hasPassword === undefined ? undefined : { label: 'Save password in the system keychain', onChange: (v) => (remember = v) },
    });
    if (pw === null) throw new ConnectCancelled();
    result.typedPassword = pw;
    result.rememberPassword = remember;
    return pw;
  };

  // Saved host without a stored password (e.g. imported): ask first instead
  // of failing with an authentication error.
  const needsPassword = profile.authType !== 'key' && !profile.password && profile.hasPassword === false;

  const req = {
    id,
    host: profile.host,
    port: profile.port,
    username: profile.username,
    authType: profile.authType,
    password: profile.password,
    keyPath: profile.keyPath,
    passphrase: '',
    acceptHostKey: '',
    replaceHostKey: false,
    // Saved hosts: the backend reads the password from the OS keychain.
    profileId: profile.hasPassword ? profile.id : '',
    allowLegacyAlgorithms: !!profile.allowLegacyAlgorithms,
    agentForwarding: !!profile.agentForwarding,
  };
  if (needsPassword) req.password = await askPassword(false);

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await SSHConnect(req);
      return result;
    } catch (err) {
      const msg = String(err);

      if (msg.includes('unable to authenticate') && req.authType !== 'key') {
        req.password = await askPassword(true);
        req.profileId = '';
        continue;
      }

      if (msg.includes(LOCKED)) throw new ConnectCancelled();

      if (msg.includes(HOSTKEY_UNKNOWN)) {
        const [, host, keyType, fp] = msg.slice(msg.indexOf(HOSTKEY_UNKNOWN)).split('|');
        if (!(await confirmNewHostKey(dialogs, host, keyType, fp))) throw new ConnectCancelled();
        req.acceptHostKey = fp;
        continue;
      }

      if (msg.includes(HOSTKEY_MISMATCH)) {
        // HOSTKEY_MISMATCH|host|type|fingerprint|type fp;type fp
        const [, host, keyType, fp, known = ''] = msg.slice(msg.indexOf(HOSTKEY_MISMATCH)).split('|');
        if (req.replaceHostKey || !(await confirmChangedHostKey(dialogs, host, keyType, fp, known.split(';').filter(Boolean)))) {
          throw new ConnectCancelled();
        }
        req.acceptHostKey = fp;
        req.replaceHostKey = true;
        continue;
      }

      if (msg.includes(LEGACY) && !req.allowLegacyAlgorithms) {
        const ok = await dialogs.confirm({
          title: 'Server needs legacy algorithms',
          danger: true,
          focusCancel: true,
          confirmLabel: 'Allow for this host',
          message: `${profile.host} only offers outdated algorithms (SHA-1 or CBC), which are disabled in Settings → Security. ` +
            'Old routers and switches often need them. Allow them for this host?',
        });
        if (!ok) throw new ConnectCancelled();
        req.allowLegacyAlgorithms = true;
        result.allowedLegacy = true;
        continue;
      }

      if (msg.includes(PASSPHRASE)) {
        const keyPath = msg.slice(msg.indexOf(PASSPHRASE) + PASSPHRASE.length);
        const pass = await dialogs.prompt({
          title: 'Key passphrase',
          label: `Key ${keyPath} is encrypted. Enter its passphrase:`,
          password: true,
          confirmLabel: 'Unlock',
        });
        if (pass === null) throw new ConnectCancelled();
        req.passphrase = pass;
        continue;
      }

      throw new Error(humanizeError(msg));
    }
  }
  throw new Error('Could not connect');
}

function humanizeError(msg: string): string {
  if (msg.includes('unable to authenticate')) return 'Wrong username, password or key';
  if (msg.includes('connection refused')) return 'Connection refused: no SSH server is listening on this port';
  if (msg.includes('i/o timeout') || msg.includes('timed out')) return 'Connection timed out';
  if (msg.includes('no such host')) return 'Host not found (DNS)';
  if (msg.includes('decrypt') || msg.includes('passphrase')) return 'Wrong key passphrase';
  return msg;
}
