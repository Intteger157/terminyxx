import { useEffect, useRef, useState } from 'react';
import { Download, FolderOpen, Minimize2, Unplug, Upload, X } from 'lucide-react';
import type { IronError, UserInteraction } from '@devolutions/iron-remote-desktop';
import type { DroppedFile, FileInfo, RdpFileTransferProvider } from '@devolutions/iron-remote-desktop-rdp';
import { ListLocalPrinters, RDPClose, RDPLastError, RDPOpenSaveFolder, RDPPickSaveFolder } from '../../../wailsjs/go/main/App';
import type { main } from '../../../wailsjs/go/models';
import { RdpAudioPlayer } from '../../lib/rdpAudio';
import { DiskStorageBackend, TRANSFER_CHUNK, printSink, saveRemoteFiles, sessionPrinters } from '../../lib/rdpFiles';
import { DriveChannel } from '../../lib/rdpDrives';
import { useDialogs } from '../ui/Dialogs';

/** Fired (detail: tab id) to pick local files and copy them to that RDP session's clipboard. */
export const RDP_SEND_FILES_EVENT = 'terminyxx:rdp-send-files';

type RdpModule = typeof import('@devolutions/iron-remote-desktop-rdp');

// The engine (IronRDP compiled to WebAssembly, ~5 MB) loads on first use.
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
  // Depending on timing the client sees the close or a truncated frame.
  if (signingIn && !gateway && /WebSocket\s+Closed|not enough bytes/i.test(first)) {
    return { text: 'The server closed the connection during sign-in, usually because of a wrong user name or password', auth: true };
  }
  return { text: gateway || first || 'Connection failed', auth: false };
}

/** What the file-transfer chip at the bottom of the pane shows. */
type Transfer =
  | { kind: 'offer'; files: FileInfo[] }
  | { kind: 'saving'; done: number; total: number; fileName: string; percent: number }
  | { kind: 'saved'; dir: string; count: number }
  | { kind: 'sending'; total: number; done: number; percent: number; pulled: boolean }
  | { kind: 'sent'; count: number };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const even = (n: number) => Math.max(200, Math.floor(n / 2) * 2);

// Without the graphics pipeline (IronRDP web has it off) Windows' RDP server
// accepts desktops up to 4096x2048; a larger request gets a resolution of the
// server's choosing, with another aspect ratio than the pane.
const MAX_DESKTOP_W = 4096;
const MAX_DESKTOP_H = 2048;

/**
 * The desktop size for a pane of `cssW` x `cssH` CSS pixels. On Retina and
 * other high-density screens it is requested in device pixels and Windows is
 * asked to scale its UI by the same factor (as Windows App does), so text is
 * sharp instead of an upscaled low-resolution picture. A pane too large for
 * that (an external 4K or 5K display) gets fewer pixels with the same aspect
 * ratio and a smaller UI scale, so it is still filled.
 */
function desktopFor(cssW: number, cssH: number): { width: number; height: number; percent: number } {
  const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 4);
  const ratio = Math.min(dpr, MAX_DESKTOP_W / cssW, MAX_DESKTOP_H / cssH);
  const step = Math.round(ratio * 4) / 4; // Windows' scale steps are 25%
  return {
    width: Math.min(MAX_DESKTOP_W, even(cssW * ratio)),
    height: Math.min(MAX_DESKTOP_H, even(cssH * ratio)),
    percent: Math.min(500, Math.max(100, Math.round(step * 100))),
  };
}

/** The server's current desktop size: the component's canvas follows it. */
function currentDesktop(el: HTMLElement | null): { width: number; height: number } | null {
  const canvas = el?.shadowRoot?.querySelector('canvas');
  return canvas ? { width: canvas.width, height: canvas.height } : null;
}

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
  fullscreen = false,
  title = '',
  onExitFullscreen,
  onDisconnect,
  onConnected,
  onEnded,
}: {
  tabId: string;
  session: main.RDPSession;
  visible: boolean;
  focused: boolean;
  dynamicResolution: boolean;
  /** Covers the whole window (the app also puts the window in full screen). */
  fullscreen?: boolean;
  title?: string;
  onExitFullscreen?: () => void;
  onDisconnect?: () => void;
  onConnected: () => void;
  /** error is null when the session ended normally. */
  onEnded: (error: string | null, authFailed: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const element = useRef<HTMLElement | null>(null);
  const ui = useRef<UserInteraction | null>(null);
  const live = useRef(false);
  const syncSize = useRef<() => void>(() => {});
  const cb = useRef({ onConnected, onEnded });
  cb.current = { onConnected, onEnded };
  const dialogs = useDialogs();
  const files = useRef<{ provider: RdpFileTransferProvider; backend: DiskStorageBackend } | null>(null);
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [dropping, setDropping] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let started = false;
    let connected = false;
    let driveChannel: DriveChannel | null = null;
    const container = host.current!;
    const audio = (session.audio || 'local') === 'local' ? new RdpAudioPlayer() : null;
    const resumeAudio = () => audio?.resume();
    container.addEventListener('pointerdown', resumeAudio);
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
        // Fill the pane exactly. The desktop is requested at the pane's size, so
        // this is 1:1 unless the server picks another size (or the host has a
        // fixed resolution): then it is stretched, like mstsc's smart sizing,
        // instead of letterboxed.
        el.setAttribute('scale', 'stretch');
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
        if (session.clipboard) {
          // Files copied on either side travel over the clipboard channel.
          const backend = new DiskStorageBackend();
          const provider = new rdp.RdpFileTransferProvider({ chunkSize: TRANSFER_CHUNK, storageBackend: backend });
          provider.on('files-available', (list) => {
            if (!list.some((f) => !f.isDirectory)) return;
            setTransfer((t) => (t?.kind === 'saving' || t?.kind === 'sending' ? t : { kind: 'offer', files: list }));
          });
          provider.on('error', (e) => {
            if (cancelled) return;
            const what = e.direction === 'upload' ? 'Copying to the remote desktop' : 'Saving';
            dialogs.toast(`${what} failed: ${e.message}`, 'error');
            if (e.direction === 'upload') setTransfer((t) => (t?.kind === 'sending' ? null : t));
          });
          // The typings declare the upload hooks private; the component sets them to
          // pause its clipboard polling while an upload is on the remote clipboard.
          u.enableFileTransfer(provider as unknown as Parameters<UserInteraction['enableFileTransfer']>[0]);
          files.current = { provider, backend };
        }

        const rect = container.getBoundingClientRect();
        const fitPane = dynamicResolution || !session.width || !session.height;
        const fit = desktopFor(rect.width, rect.height);
        const percent = fit.percent;
        const width = fitPane ? fit.width : session.width;
        const height = fitPane ? fit.height : session.height;
        const builder = u
          .configBuilder()
          .withUsername(session.username)
          .withPassword(session.password)
          .withServerDomain(session.domain)
          .withDestination(session.destination)
          .withProxyAddress(session.proxyUrl)
          .withAuthToken(session.token)
          .withDesktopSize({ width, height })
          .withExtension(rdp.displayControl(true));
        if (fitPane && percent > 100) builder.withExtension(rdp.desktopScaleFactor(percent));
        if (audio) builder.withExtension(rdp.audioPlayback(audio.onMessage));
        if (session.printers) {
          const local = await ListLocalPrinters().catch(() => []);
          if (cancelled) return;
          const native = session.printerDrivers === 'native';
          const { list, targets } = sessionPrinters(local, session.printerDrivers);
          const sink = printSink(
            (deviceId) => targets.get(deviceId),
            title || 'Remote desktop document',
            (target) =>
              dialogs.toast(target.mode === 'open' ? 'The printed document opened in your PDF viewer' : `Sent to ${target.printer}`, 'success'),
            (msg) => dialogs.toast(`Printing failed: ${msg}`, 'error')
          );
          // Report the printers the server refused, once they have all answered.
          const refused: string[] = [];
          let report = 0;
          sink.onPrinterAnnounced = (deviceId, accepted) => {
            if (accepted || cancelled) return;
            const name = list.find((p) => p.deviceId === deviceId)?.name;
            if (name) refused.push(name);
            window.clearTimeout(report);
            report = window.setTimeout(() => {
              const hint = native ? ' Its driver may be missing there: try "Universal (PDF)" printer drivers for this host.' : '';
              dialogs.toast(`The remote computer didn't add ${refused.length === 1 ? 'the printer' : 'printers'} ${refused.join(', ')}.${hint}`, 'error');
              refused.length = 0;
            }, 1500);
          };
          builder.withExtension(rdp.printers(list)).withExtension(rdp.printJobStreamCallbacks(sink));
        }
        if (session.drivesFailed?.length) {
          dialogs.toast(`Couldn't share ${session.drivesFailed.join(', ')}: the folder is missing or not accessible`, 'error');
        }
        const drives = session.drives ?? [];
        if (drives.length > 0 && session.driveUrl) {
          driveChannel = new DriveChannel(
            session.driveUrl,
            (r) => {
              try {
                ui.current?.invokeExtension(rdp.driveReply(r));
              } catch (e) {
                if (!cancelled) console.warn('[drives] reply refused', r, e);
              }
            },
            (deviceId, accepted) => {
              if (accepted || cancelled) return;
              const name = drives.find((d) => d.deviceId === deviceId)?.name ?? 'a folder';
              dialogs.toast(`The remote computer didn't add the shared folder ${name}`, 'error');
            },
            session.driveTrace
          );
          builder
            .withExtension(rdp.drives(drives.map((d) => ({ deviceId: d.deviceId, name: d.name }))))
            .withExtension(rdp.driveRequestCallback(driveChannel.handle));
          if (session.driveTrace) builder.withExtension(rdp.driveTrace(true));
        }
        const config = builder.build();

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
        // The pane may have changed while connecting (full screen, sidebar), and
        // a resize sent before Display Control is up is dropped: check again.
        window.setTimeout(() => syncSize.current(), 1500);
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
      container.removeEventListener('pointerdown', resumeAudio);
      audio?.close();
      driveChannel?.close();
      if (!started) return;
      live.current = false;
      try {
        ui.current?.shutdown();
      } catch {
        // already ended
      }
      RDPClose(tabId).catch(() => {});
      files.current = null;
      element.current?.remove();
      element.current = null;
      ui.current = null;
    };
    // A new session object means a new connection; the rest is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Follow the pane size: the server changes its resolution (Display
  // Control), otherwise the picture is scaled to fit.
  // A request can be dropped (Display Control not open yet) or answered with
  // another size, so it is compared with the desktop the server reports and
  // sent again a few times, not just once per pane size.
  useEffect(() => {
    if (!dynamicResolution) {
      syncSize.current = () => {};
      return;
    }
    const container = host.current!;
    let timer = 0;
    let recheck = 0;
    let last = '';
    let attempts = 0;
    const sync = () => {
      window.clearTimeout(recheck);
      const r = container.getBoundingClientRect();
      if (!live.current || r.width < 50 || r.height < 50) return;
      const want = desktopFor(r.width, r.height);
      const have = currentDesktop(element.current);
      const key = `${want.width}x${want.height}@${want.percent}`;
      if (key !== last) {
        last = key;
        attempts = 0;
      } else if (have && Math.abs(have.width - want.width) <= 8 && Math.abs(have.height - want.height) <= 8) {
        return;
      }
      if (attempts >= 3) return;
      attempts++;
      ui.current?.resize(want.width, want.height, want.percent);
      recheck = window.setTimeout(sync, 2500);
    };
    syncSize.current = sync;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(sync, 400);
    });
    ro.observe(container);
    return () => {
      ro.disconnect();
      window.clearTimeout(timer);
      window.clearTimeout(recheck);
      syncSize.current = () => {};
    };
  }, [dynamicResolution]);

  useEffect(() => {
    if ((visible && focused) || fullscreen) element.current?.focus();
  }, [visible, focused, fullscreen]);

  const refocus = () => element.current?.focus();

  /** Puts local files on the remote clipboard; the user pastes them there. */
  const send = (list: File[] | DroppedFile[]) => {
    const f = files.current;
    if (!f || !live.current) return;
    const total = (list as Array<File | DroppedFile>).filter((x) => !('isDirectory' in x && x.isDirectory)).length;
    if (total === 0) return;
    if (f.provider.isUploadInProgress()) {
      dialogs.toast('Wait until the previous files are pasted on the remote desktop', 'info');
      return;
    }
    let done = 0;
    const onProgress = (p: { percentage: number }) =>
      setTransfer((t) => (t?.kind === 'sending' ? { ...t, pulled: true, percent: p.percentage } : t));
    const onComplete = () => {
      done++;
      setTransfer((t) => (t?.kind === 'sending' ? { ...t, pulled: true, done, percent: 0 } : t));
    };
    f.provider.on('upload-progress', onProgress);
    f.provider.on('upload-complete', onComplete);
    setTransfer({ kind: 'sending', total, done: 0, percent: 0, pulled: false });
    const { completion } = f.provider.uploadFiles(list);
    completion
      .then(() => setTransfer((t) => (t?.kind === 'sending' ? { kind: 'sent', count: total } : t)))
      .catch(() => setTransfer((t) => (t?.kind === 'sending' ? null : t)))
      .finally(() => {
        f.provider.off('upload-progress', onProgress);
        f.provider.off('upload-complete', onComplete);
      });
    refocus();
  };

  /** Saves files copied on the remote desktop into a folder the user picks. */
  const save = async (list: FileInfo[]) => {
    const f = files.current;
    if (!f) return;
    const dir = await RDPPickSaveFolder().catch((e) => {
      dialogs.toast(String(e), 'error');
      return '';
    });
    refocus();
    if (!dir || files.current !== f) return;
    const total = list.filter((x) => !x.isDirectory).length;
    setTransfer({ kind: 'saving', done: 0, total, fileName: '', percent: 0 });
    try {
      const count = await saveRemoteFiles(f.provider, f.backend, list, dir, (p) => setTransfer({ kind: 'saving', ...p }));
      setTransfer({ kind: 'saved', dir, count });
    } catch (e) {
      setTransfer(null);
      dialogs.toast(`Saving failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  // "Send files" from the status bar or the full-screen bar. The file
  // picker must open within the click, so the event is handled synchronously.
  const pick = useRef<() => void>(() => {});
  pick.current = () => {
    if (!files.current || !live.current) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = () => send(Array.from(input.files ?? []));
    input.click();
  };
  useEffect(() => {
    const onSend = (e: Event) => {
      if ((e as CustomEvent<string>).detail === tabId) pick.current();
    };
    window.addEventListener(RDP_SEND_FILES_EVENT, onSend);
    return () => window.removeEventListener(RDP_SEND_FILES_EVENT, onSend);
  }, [tabId]);

  // Finished states and unanswered offers go away on their own.
  useEffect(() => {
    if (!transfer || transfer.kind === 'saving' || transfer.kind === 'sending') return;
    const t = window.setTimeout(() => setTransfer(null), transfer.kind === 'offer' ? 30000 : 8000);
    return () => window.clearTimeout(t);
  }, [transfer]);

  const isFileDrag = (e: React.DragEvent) => !!files.current && live.current && e.dataTransfer.types.includes('Files');

  return (
    <div
      ref={host}
      className={`${fullscreen ? 'fixed z-[55]' : 'absolute'} inset-0 bg-black overflow-hidden`}
      onDragOver={(e) => {
        if (!isFileDrag(e)) return;
        files.current!.provider.handleDragOver(e.nativeEvent);
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(e) => {
        setDropping(false);
        if (!isFileDrag(e)) return;
        e.preventDefault();
        files.current!.provider.handleDrop(e.nativeEvent).then(send, (err) => dialogs.toast(String(err), 'error'));
      }}
    >
      {fullscreen && (
        <FullscreenBar
          title={title}
          onExit={() => {
            onExitFullscreen?.();
          }}
          onDisconnect={() => onDisconnect?.()}
          onSendFiles={session.clipboard ? () => pick.current() : undefined}
          refocus={refocus}
        />
      )}
      {dropping && (
        <div className="absolute inset-3 z-20 rounded-xl border-2 border-dashed border-accent/70 bg-accent/10 flex items-center justify-center pointer-events-none">
          <span className="px-3 py-1.5 rounded-lg bg-surface-raised/95 text-sm text-gray-200 shadow-pop">Drop to copy to the remote clipboard</span>
        </div>
      )}
      {transfer && (
        <TransferChip
          transfer={transfer}
          onSave={(list) => void save(list)}
          onOpenFolder={(dir) => {
            RDPOpenSaveFolder(dir).catch((e) => dialogs.toast(String(e), 'error'));
            setTransfer(null);
          }}
          onClose={() => {
            setTransfer(null);
            refocus();
          }}
        />
      )}
    </div>
  );
}

/**
 * The connection bar of a full-screen session (like mstsc's): hidden at the
 * top edge, slides down when the pointer reaches it. Keyboard focus goes back
 * to the remote desktop after each click, so shortcuts keep reaching it.
 */
function FullscreenBar({
  title,
  onExit,
  onDisconnect,
  onSendFiles,
  refocus,
}: {
  title: string;
  onExit: () => void;
  onDisconnect: () => void;
  onSendFiles?: () => void;
  refocus: () => void;
}) {
  const [shown, setShown] = useState(true);
  const hideTimer = useRef(0);
  // Show briefly on entry so the user learns where it is.
  useEffect(() => {
    hideTimer.current = window.setTimeout(() => setShown(false), 2500);
    return () => window.clearTimeout(hideTimer.current);
  }, []);
  const show = () => {
    window.clearTimeout(hideTimer.current);
    setShown(true);
  };
  const hide = () => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setShown(false), 600);
  };
  const mac = navigator.platform.toLowerCase().includes('mac');
  const mod = mac ? '⌘⌥' : 'Ctrl+Alt+';
  // In macOS full screen, the cursor at the top edge slides the menu bar and the
  // window's title bar over the page, so there the bar drops below them.
  const place = mac
    ? `top-0 rounded-xl ${shown ? 'translate-y-[80px]' : '-translate-y-full'}`
    : `top-0 rounded-b-xl ${shown ? 'translate-y-0' : '-translate-y-full'}`;
  return (
    <>
      <div className="absolute top-0 inset-x-0 h-1.5 z-10" onPointerEnter={show} />
      <div
        className={`absolute left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 pl-4 pr-1.5 py-1.5 bg-surface-raised/95 backdrop-blur-xl shadow-pop ring-1 ring-white/[0.06] transition-transform duration-200 ${place}`}
        onPointerEnter={show}
        onPointerLeave={hide}
      >
        <span className="text-[12px] text-gray-300 max-w-[40vw] truncate pr-2">{title}</span>
        <button
          className="btn-secondary h-7 px-2.5 text-xs"
          title={`Exit full screen (${mod}Enter)`}
          onClick={() => {
            onExit();
            refocus();
          }}
        >
          <Minimize2 size={13} /> Exit full screen
        </button>
        {onSendFiles && (
          <button className="icon-btn w-7 h-7" title="Copy files to the remote clipboard" onClick={onSendFiles}>
            <Upload size={14} />
          </button>
        )}
        <button className="icon-btn w-7 h-7 text-red-300 hover:text-red-200" title="Disconnect" onClick={onDisconnect}>
          <Unplug size={14} />
        </button>
      </div>
    </>
  );
}

/** The file-transfer status at the bottom right of the pane. */
function TransferChip({
  transfer: t,
  onSave,
  onOpenFolder,
  onClose,
}: {
  transfer: Transfer;
  onSave: (files: FileInfo[]) => void;
  onOpenFolder: (dir: string) => void;
  onClose: () => void;
}) {
  const busy = t.kind === 'saving' || t.kind === 'sending';
  let text = '';
  let percent: number | null = null;
  switch (t.kind) {
    case 'offer': {
      const list = t.files.filter((f) => !f.isDirectory);
      text = list.length === 1 ? `Copied on the remote: ${list[0].name}` : `${plural(list.length, 'file')} copied on the remote`;
      break;
    }
    case 'saving':
      text = t.total > 1 ? `Saving ${Math.min(t.done + 1, t.total)} of ${t.total}: ${t.fileName}` : `Saving ${t.fileName}`;
      percent = t.percent;
      break;
    case 'saved':
      text = `Saved ${plural(t.count, 'file')}`;
      break;
    case 'sending':
      if (t.pulled) {
        text = t.total > 1 ? `Copying ${Math.min(t.done + 1, t.total)} of ${t.total} to the remote` : 'Copying to the remote';
        percent = t.percent;
      } else {
        text = `${plural(t.total, 'file')} on the remote clipboard: paste with Ctrl+V on the remote desktop`;
      }
      break;
    case 'sent':
      text = `Copied ${plural(t.count, 'file')} to the remote`;
      break;
  }
  const Icon = t.kind === 'sending' || t.kind === 'sent' ? Upload : Download;
  return (
    <div className="absolute bottom-3 right-3 z-20 max-w-[min(480px,calc(100%-24px))] flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-xl bg-surface-raised/95 backdrop-blur-xl shadow-pop ring-1 ring-white/[0.06] text-[12px] text-gray-300">
      <Icon size={13} className="shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <div className="truncate" title={text}>
          {text}
        </div>
        {percent !== null && (
          <div className="mt-1 h-1 rounded-full bg-white/[0.08] overflow-hidden">
            <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${Math.round(percent)}%` }} />
          </div>
        )}
      </div>
      {t.kind === 'offer' && (
        <button className="btn-secondary h-7 px-2.5 text-xs shrink-0" onClick={() => onSave(t.files)}>
          Save to…
        </button>
      )}
      {t.kind === 'saved' && (
        <button className="btn-secondary h-7 px-2.5 text-xs shrink-0" onClick={() => onOpenFolder(t.dir)}>
          <FolderOpen size={13} /> Show
        </button>
      )}
      {!busy && (
        <button className="icon-btn w-7 h-7 shrink-0" title="Dismiss" onClick={onClose}>
          <X size={13} />
        </button>
      )}
    </div>
  );
}
