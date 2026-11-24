import { SSHConnect } from '../../wailsjs/go/main/App';
import { connection } from '../../wailsjs/go/models';
import type { SSHProfile } from '../types';
import type { useDialogs } from '../components/ui/Dialogs';
import { confirmChangedHostKey, confirmNewHostKey } from '../components/security/securityPrompts';

type Dialogs = ReturnType<typeof useDialogs>;

export class ConnectCancelled extends Error {}
export class SSHConnectFailure extends Error {
  constructor(message: string, readonly diagnostic?: connection.SSHDiagnostic) {
    super(message);
  }
}
/** A quiet (automatic) connect stopped because it needs the user: password, host key, passphrase. */
export class ConnectNeedsUser extends SSHConnectFailure {}

// Error strings from the Go side (see internal/connection).
const HOSTKEY_UNKNOWN = 'HOSTKEY_UNKNOWN|';
const HOSTKEY_MISMATCH = 'HOSTKEY_MISMATCH|';
const PASSPHRASE = 'KEY_PASSPHRASE_REQUIRED|';
const LEGACY = 'LEGACY_ALGORITHMS_REQUIRED|';
const LOCKED = 'app is locked';
const DIAGNOSTIC = '\nSSH_DIAGNOSTIC|';

function splitSSHError(err: unknown): { message: string; diagnostic?: connection.SSHDiagnostic } {
  const text = String(err);
  const marker = text.lastIndexOf(DIAGNOSTIC);
  if (marker === -1) return { message: text };
  try {
    const diagnostic: connection.SSHDiagnostic = JSON.parse(text.slice(marker + DIAGNOSTIC.length));
    if (Array.isArray(diagnostic?.checks)) return { message: text.slice(0, marker), diagnostic };
  } catch {
    // Fall back to the original error if no report could be decoded.
  }
  return { message: text };
}

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
export async function connectWithPrompts(
  id: string,
  profile: SSHProfile,
  dialogs: Dialogs,
  opts: { interactive?: boolean } = {}
): Promise<ConnectResult> {
  const interactive = opts.interactive !== false;
  const result: ConnectResult = { rememberPassword: false };
  let diagnostic: connection.SSHDiagnostic | undefined;
  /** In quiet mode every question to the user ends the attempt instead. */
  const needUser = (why: string) => {
    if (!interactive) throw new ConnectNeedsUser(why, diagnostic);
  };
  const target = `${profile.username}@${profile.host}`;

  const askPassword = async (retry: boolean) => {
    needUser(retry ? 'the password was rejected' : 'a password is needed');
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
    jumpFor: profile.id,
    allowLegacyAlgorithms: !!profile.allowLegacyAlgorithms,
    agentForwarding: !!profile.agentForwarding,
  };
  if (needsPassword) req.password = await askPassword(false);

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await SSHConnect(connection.ConnectRequest.createFrom({ ...req, jump: [] }));
      return result;
    } catch (err) {
      const { message: msg, diagnostic: report } = splitSSHError(err);
      diagnostic = report;
      const failed = report?.checks.at(-1);

      if (failed?.jump && (failed.stage === 'Credentials' || msg.includes('unable to authenticate') || msg.includes(LEGACY))) {
        const message = `Jump host ${failed.address}: ${failed.failure}`;
        needUser(message);
        throw new SSHConnectFailure(message, report);
      }

      if (msg.includes('unable to authenticate')) needUser('authentication failed');
      if (msg.includes('unable to authenticate') && req.authType !== 'key') {
        req.password = await askPassword(true);
        req.profileId = '';
        continue;
      }

      if (msg.includes(LOCKED)) throw new ConnectCancelled();

      if (msg.includes(HOSTKEY_UNKNOWN)) {
        needUser('the host key is not trusted yet');
        const [, host, keyType, fp] = msg.slice(msg.indexOf(HOSTKEY_UNKNOWN)).split('|');
        if (!(await confirmNewHostKey(dialogs, host, keyType, fp))) throw new ConnectCancelled();
        req.acceptHostKey = fp;
        continue;
      }

      if (msg.includes(HOSTKEY_MISMATCH)) {
        needUser('the host key has changed');
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
        needUser('the server needs legacy algorithms');
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
        needUser('the key passphrase is needed');
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

      throw new SSHConnectFailure(humanizeError(msg), diagnostic);
    }
  }
  throw new SSHConnectFailure('Could not connect', diagnostic);
}

export function humanizeError(msg: string): string {
  if (msg.includes('unable to authenticate')) return 'Wrong username, password or key';
  if (msg.includes('connection refused')) return 'Connection refused: no SSH server is listening on this port';
  if (msg.includes('i/o timeout') || msg.includes('timed out')) return 'Connection timed out';
  if (msg.includes('no such host')) return 'Host not found (DNS)';
  if (msg.includes('decrypt') || msg.includes('passphrase')) return 'Wrong key passphrase';
  return msg;
}
