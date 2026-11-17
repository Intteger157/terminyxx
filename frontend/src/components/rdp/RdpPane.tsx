import { useEffect, useRef } from 'react';
import type { IronError, UserInteraction } from '@devolutions/iron-remote-desktop';
import { RDPClose, RDPLastError } from '../../../wailsjs/go/main/App';
import type { main } from '../../../wailsjs/go/models';

type RdpModule = typeof import('@devolutions/iron-remote-desktop-rdp');

// The engine (IronRDP compiled to WebAssembly, ~6 MB) loads on first use.
let engine: Promise<RdpModule> | null = null;
function loadEngine(): Promise<RdpModule> {
  engine ??= (async () => {
    const [rdp] = await Promise.all([
      import('@devolutions/iron-remote-desktop-rdp'),
      import('@devolutions/iron-remote-desktop'), // registers <iron-remote-desktop>
    ]);
    await rdp.init('WARN');
    return rdp;
  })();
  engine.catch(() => (engine = null));
  return engine;
}

function isIronError(e: unknown): e is IronError {
  return !!e && typeof (e as IronError).kind === 'function' && typeof (e as IronError).backtrace === 'function';
}

// IronErrorKind values (the enum is declared, not exported at runtime).
const KIND_WRONG_PASSWORD = 1;
const KIND_LOGON_FAILURE = 2;
const KIND_ACCESS_DENIED = 3;
const KIND_RDCLEANPATH = 4;

async function describe(err: unknown, tabId: string, signingIn: boolean): Promise<{ text: string; auth: boolean }> {
  const gateway = await RDPLastError(tabId).catch(() => '');
  if (!isIronError(err)) return { text: gateway || String(err), auth: false };
  switch (err.kind()) {
    case KIND_WRONG_PASSWORD:
    case KIND_LOGON_FAILURE:
      return { text: 'Wrong user name or password', auth: true };
    case KIND_ACCESS_DENIED:
      return { text: 'Access denied', auth: true };
    case KIND_RDCLEANPATH:
      if (gateway) return { text: gateway, auth: false };
  }
  const first = err.backtrace().split('\n')[0];
  // With NLA, Windows answers wrong credentials by dropping the connection
  // (its log says ERROR_LOGON_FAILURE) instead of sending an error code.
  if (signingIn && !gateway && /WebSocket\s+Closed/i.test(first)) {
    return { text: 'The server closed the connection during sign-in, usually because of a wrong user name or password', auth: true };
  }
  return { text: gateway || first || 'Connection failed', auth: false };
}

const even = (n: number) => Math.max(200, Math.floor(n / 2) * 2);

/**
 * One built-in RDP session. `session` is single-use (its token expires once
 * the gateway accepts it), so a reconnect passes a new one and this pane
 * starts over.
 */
export function RdpPane({
  tabId,
  session,
  visible,
  focused,
  dynamicResolution,
  onConnected,
  onEnded,
}: {
  tabId: string;
  session: main.RDPSession;
  visible: boolean;
  focused: boolean;
  dynamicResolution: boolean;
  onConnected: () => void;
  /** error is null when the session ended normally. */
  onEnded: (error: string | null, authFailed: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const element = useRef<HTMLElement | null>(null);
  const ui = useRef<UserInteraction | null>(null);
  const live = useRef(false);
  const cb = useRef({ onConnected, onEnded });
  cb.current = { onConnected, onEnded };

  useEffect(() => {
    let cancelled = false;
    let started = false;
    let connected = false;
    const container = host.current!;
    // The ticket is single-use: start on the next tick so a StrictMode
    // mount/unmount/mount (dev) doesn't spend it on a throwaway mount.
    const timer = window.setTimeout(() => {
      started = true;
      void start();
    }, 0);
    const start = async () => {
      try {
        const rdp = await loadEngine();
        if (cancelled) return;
        const el = document.createElement('iron-remote-desktop');
        Object.assign(el, { module: rdp.Backend });
        el.setAttribute('scale', 'fit');
        el.setAttribute('verbose', 'false');
        el.setAttribute('flexcenter', 'true');
        el.style.cssText = 'display:flex;position:absolute;inset:0;';
        const ready = new Promise<UserInteraction>((resolve) =>
          el.addEventListener('ready', (e) => resolve((e as CustomEvent).detail.irgUserInteraction), { once: true })
        );
        container.appendChild(el);
        element.current = el;
        const u = await ready;
        if (cancelled) return;
        ui.current = u;
        u.setEnableClipboard(session.clipboard);

        const rect = container.getBoundingClientRect();
        const width = dynamicResolution || !session.width ? even(rect.width) : session.width;
        const height = dynamicResolution || !session.height ? even(rect.height) : session.height;
        const config = u
          .configBuilder()
          .withUsername(session.username)
          .withPassword(session.password)
          .withServerDomain(session.domain)
          .withDestination(session.destination)
          .withProxyAddress(session.proxyUrl)
          .withAuthToken(session.token)
          .withDesktopSize({ width, height })
          .withExtension(rdp.displayControl(true))
          .build();

        const info = await u.connect(config);
        connected = true;
        if (cancelled) {
          u.shutdown();
          return;
        }
        live.current = true;
        u.setVisibility(true);
        cb.current.onConnected();
        if (focused) el.focus();
        await info.run();
        live.current = false;
        if (!cancelled) cb.current.onEnded(null, false);
      } catch (err) {
        live.current = false;
        if (cancelled) return;
        const { text, auth } = await describe(err, tabId, !connected);
        cb.current.onEnded(text, auth);
      }
    };
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (!started) return;
      live.current = false;
      try {
        ui.current?.shutdown();
      } catch {
        // already ended
      }
      RDPClose(tabId).catch(() => {});
      element.current?.remove();
      element.current = null;
      ui.current = null;
    };
    // A new session object means a new connection; the rest is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Follow the pane size: the server changes its resolution (Display
  // Control), otherwise the picture is scaled to fit.
  useEffect(() => {
    if (!dynamicResolution) return;
    const container = host.current!;
    let timer = 0;
    let last = '';
    const ro = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const r = container.getBoundingClientRect();
        if (!live.current || r.width < 50 || r.height < 50) return;
        const key = `${even(r.width)}x${even(r.height)}`;
        if (key === last) return;
        last = key;
        ui.current?.resize(even(r.width), even(r.height));
      }, 400);
    });
    ro.observe(container);
    return () => {
      ro.disconnect();
      window.clearTimeout(timer);
    };
  }, [dynamicResolution]);

  useEffect(() => {
    if (visible && focused) element.current?.focus();
  }, [visible, focused]);

  return <div ref={host} className="absolute inset-0 bg-black overflow-hidden" />;
}
