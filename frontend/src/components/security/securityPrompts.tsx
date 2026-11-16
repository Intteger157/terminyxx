import { AlertTriangle, ShieldAlert } from 'lucide-react';
import type { useDialogs } from '../ui/Dialogs';
import { checkPaste, needsConfirm, visibleParts } from '../../lib/pasteGuard';
import { getSettings } from '../../lib/settings';

type Dialogs = ReturnType<typeof useDialogs>;

/** Shows text with invisible and control characters made visible. */
export function Payload({ text, max = 4000 }: { text: string; max?: number }) {
  const cut = text.length > max;
  const parts = visibleParts(cut ? text.slice(0, max) : text);
  return (
    <pre className="max-h-64 overflow-auto rounded-lg bg-black/40 ring-1 ring-inset ring-white/[0.06] px-3 py-2 text-[12px] leading-relaxed font-mono text-gray-200 whitespace-pre-wrap break-all">
      {parts.map((p, i) =>
        p.special ? (
          <span key={i} className="text-amber-300/90">
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
      {cut && <span className="text-gray-500">{`\n… ${(text.length - max).toLocaleString('en-US')} more characters`}</span>}
    </pre>
  );
}

/**
 * Paste protection: resolves true when text may be written to the shell,
 * asking first if it spans several lines, contains dangerous commands or
 * hides control characters.
 */
export async function confirmPaste(text: string, dialogs: Dialogs): Promise<boolean> {
  const check = checkPaste(text, getSettings().security.paste);
  if (!needsConfirm(check)) return true;
  const risky = check.dangerous.length > 0 || check.hidden.length > 0;
  return dialogs.confirm({
    title: risky ? 'Paste potentially dangerous text?' : `Paste ${check.lines} lines?`,
    danger: risky,
    focusCancel: risky,
    width: 'max-w-xl',
    confirmLabel: 'Paste',
    message: (
      <div className="space-y-3">
        {check.dangerous.length > 0 && (
          <Warning title="Dangerous commands">
            {check.dangerous.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </Warning>
        )}
        {check.hidden.length > 0 && (
          <Warning title="Hidden content (possible pastejacking)">
            {check.hidden.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </Warning>
        )}
        {check.multiline && (
          <p className="text-[12.5px] text-gray-400">
            The text has {check.lines} lines. Each line break acts like pressing Enter, so the commands may run immediately.
          </p>
        )}
        <Payload text={text} />
        <p className="text-2xs text-gray-500">This is exactly what will be sent to the terminal. Highlighted symbols are normally invisible.</p>
      </div>
    ),
  });
}

function Warning({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-lg bg-red-500/10 ring-1 ring-inset ring-red-500/20 px-3 py-2 text-[12.5px] text-red-200">
      <AlertTriangle size={14} className="flex-shrink-0 mt-0.5 text-red-400" />
      <div>
        <div className="font-medium text-red-300">{title}</div>
        <ul className="mt-0.5 list-disc pl-4 space-y-0.5 text-red-200/90">{children}</ul>
      </div>
    </div>
  );
}

/** OSC 52: a remote program asks to put text on the local clipboard. */
export function confirmOsc52(text: string, host: string, dialogs: Dialogs): Promise<boolean> {
  return dialogs.confirm({
    title: 'Allow clipboard access?',
    confirmLabel: 'Copy to clipboard',
    cancelLabel: 'Block',
    focusCancel: true,
    width: 'max-w-lg',
    message: (
      <div className="space-y-3">
        <p>
          A program on <span className="font-mono text-gray-100">{host}</span> wants to copy this text to your clipboard (OSC 52):
        </p>
        <Payload text={text} max={2000} />
        <p className="text-2xs text-gray-500">You can allow this without asking, or turn it off, in Settings → Security → Clipboard.</p>
      </div>
    ),
  });
}

/** Unknown host key (trust on first use). */
export function confirmNewHostKey(dialogs: Dialogs, host: string, keyType: string, fingerprint: string): Promise<boolean> {
  return dialogs.confirm({
    title: 'Verify new host',
    confirmLabel: 'Trust and connect',
    width: 'max-w-lg',
    message: (
      <div className="space-y-2.5">
        <p>
          You haven't connected to <span className="font-mono text-gray-100">{host}</span> before, so its identity can't be checked yet.
        </p>
        <Fingerprint label={`${keyType} key fingerprint`} value={fingerprint} tone="accent" />
        <p className="text-2xs text-gray-500">
          Compare it with the fingerprint from the server administrator (on the server: <span className="font-mono">ssh-keygen -lf /etc/ssh/ssh_host_*_key.pub</span>).
          Once trusted, Terminyxx warns you if the key ever changes.
        </p>
      </div>
    ),
  });
}

/**
 * Changed host key: blocked by default. Returns true only if the user
 * explicitly chose to replace the key and confirmed by typing the host.
 */
export async function confirmChangedHostKey(dialogs: Dialogs, host: string, keyType: string, fingerprint: string, known: string[]): Promise<boolean> {
  const replace = await dialogs.confirm({
    title: 'Warning: the host key has changed',
    danger: true,
    focusCancel: true,
    width: 'max-w-xl',
    cancelLabel: 'Disconnect',
    confirmLabel: 'Replace key…',
    message: (
      <div className="space-y-3">
        <div className="flex gap-2.5 rounded-lg bg-red-500/10 ring-1 ring-inset ring-red-500/25 px-3 py-2.5 text-[12.5px] text-red-200">
          <ShieldAlert size={16} className="flex-shrink-0 mt-0.5 text-red-400" />
          <span>
            <span className="font-mono text-red-100">{host}</span> presented a different key than the one you trusted. Someone could be intercepting the
            connection (man-in-the-middle attack), or the server was reinstalled. The connection was blocked.
          </span>
        </div>
        {known.map((k, i) => {
          const [t, ...fp] = k.split(' ');
          return <Fingerprint key={i} label={`Trusted ${t} key`} value={fp.join(' ')} tone="muted" />;
        })}
        <Fingerprint label={`Presented ${keyType} key`} value={fingerprint} tone="danger" />
        <p className="text-2xs text-gray-500">Only replace the key if the server administrator confirms the new fingerprint.</p>
      </div>
    ),
  });
  if (!replace) return false;
  const typed = await dialogs.prompt({
    title: 'Replace trusted host key',
    label: `Type the host name (${host}) to trust the new key:`,
    confirmLabel: 'Replace and connect',
  });
  return typed !== null && typed.trim() === host;
}

function Fingerprint({ label, value, tone }: { label: string; value: string; tone: 'accent' | 'danger' | 'muted' }) {
  const color = tone === 'danger' ? 'text-red-300 ring-red-500/30' : tone === 'accent' ? 'text-accent ring-accent/25' : 'text-gray-400 ring-white/[0.06] line-through decoration-gray-600';
  return (
    <div>
      <div className="text-2xs text-gray-500 mb-1">{label}</div>
      <code className={`block text-[12px] bg-black/40 rounded-lg px-2.5 py-1.5 break-all ring-1 ring-inset ${color}`}>{value}</code>
    </div>
  );
}

/** Ask before enabling agent forwarding for a host. */
export function confirmAgentForwarding(dialogs: Dialogs, host: string): Promise<boolean> {
  return dialogs.confirm({
    title: 'Forward your SSH agent?',
    danger: true,
    focusCancel: true,
    confirmLabel: 'Enable forwarding',
    message: (
      <div className="space-y-2">
        <p>
          While you're connected{host ? <> to <span className="font-mono text-gray-100">{host}</span></> : null}, anyone with root access on that server can use
          your local SSH keys to log in to other servers as you.
        </p>
        <p className="text-2xs text-gray-500">Only enable this for servers you fully trust. Jump hosts are usually a safer way to reach internal servers.</p>
      </div>
    ),
  });
}

