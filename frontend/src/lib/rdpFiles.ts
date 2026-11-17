import type { FileInfo, FileStorageBackend, FileWriteHandle, PrintJobStreamCallbacks, RdpFileTransferProvider, RedirectedPrinter } from '@devolutions/iron-remote-desktop-rdp';
import type { printing } from '../../wailsjs/go/models';
import { RDPFileClose, RDPFileCreate, RDPFileWrite, RDPMakeDir, RDPPrintCreate, RDPPrintFinish } from '../../wailsjs/go/main/App';

/** Chunk size for files copied between this computer and the remote desktop. */
export const TRANSFER_CHUNK = 256 * 1024;

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);
  }
  return btoa(s);
}

/**
 * Download storage that streams each file straight to disk through Go
 * instead of keeping it in memory. The provider passes only a file name, so
 * the caller downloads one file at a time and sets `target` first.
 */
export class DiskStorageBackend implements FileStorageBackend {
  readonly name = 'terminyxx-disk';
  target: { dir: string; rel: string } | null = null;
  /** Set when the provider asked for a handle for the current target. */
  used = false;
  lastPath = '';

  async createWriteHandle(): Promise<FileWriteHandle> {
    const t = this.target;
    if (!t) throw new Error('no download target');
    this.used = true;
    const handle = await RDPFileCreate(t.dir, t.rel);
    let written = 0;
    let closed = false;
    const self = this;
    return {
      get bytesWritten() {
        return written;
      },
      async write(chunk: Uint8Array) {
        await RDPFileWrite(handle, toBase64(chunk));
        written += chunk.length;
      },
      async finalize() {
        closed = true;
        self.lastPath = await RDPFileClose(handle, true);
        return new Blob([]);
      },
      async abort() {
        if (closed) return;
        closed = true;
        await RDPFileClose(handle, false).catch(() => {});
      },
    };
  }

  async dispose() {}
}

const relOf = (f: FileInfo) => (f.path ? `${f.path}\\${f.name}` : f.name);

export interface SaveProgress {
  done: number;
  total: number;
  fileName: string;
  percent: number;
}

/**
 * Saves files copied on the remote desktop into dir, one at a time (see
 * DiskStorageBackend). Folders are created first; empty files, which the
 * provider finishes without asking for storage, are created here.
 */
export async function saveRemoteFiles(
  provider: RdpFileTransferProvider,
  backend: DiskStorageBackend,
  files: FileInfo[],
  dir: string,
  onProgress: (p: SaveProgress) => void
): Promise<number> {
  const total = files.filter((f) => !f.isDirectory).length;
  for (const f of files) if (f.isDirectory) await RDPMakeDir(dir, relOf(f));
  let done = 0;
  const progress = (p: { fileName: string; percentage: number }) =>
    onProgress({ done, total, fileName: p.fileName, percent: p.percentage });
  provider.on('download-progress', progress);
  try {
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.isDirectory) continue;
      backend.target = { dir, rel: relOf(f) };
      backend.used = false;
      onProgress({ done, total, fileName: f.name, percent: 0 });
      await provider.downloadFile(f, i).completion;
      if (!backend.used) {
        const h = await RDPFileCreate(dir, relOf(f));
        await RDPFileClose(h, true);
      }
      done++;
    }
  } finally {
    backend.target = null;
    provider.off('download-progress', progress);
  }
  return done;
}

/** Where the jobs of one announced printer go (see RDPPrintFinish). */
export interface PrintTarget {
  /** open: show the PDF; pdf: print the PDF on `printer`; raw: send the data to `printer` unchanged. */
  mode: 'open' | 'pdf' | 'raw';
  printer: string;
}

/**
 * Receives documents printed on the remote desktop. Each job is written
 * through Go and, when it completes, handled as its printer's target says.
 */
export function printSink(
  targetFor: (deviceId: number) => PrintTarget | undefined,
  title: string,
  onPrinted: (target: PrintTarget) => void,
  onFailed: (message: string) => void
): PrintJobStreamCallbacks {
  // Writes must reach Go in order, so each job is a promise chain that
  // resolves to the file handle ('' once the job has failed).
  const jobs = new Map<number, { chain: Promise<string>; target: PrintTarget }>();
  const fallback: PrintTarget = { mode: 'open', printer: '' };
  const fail = async (h: string, message: string) => {
    if (h) await RDPPrintFinish(h, false, '', '', '').catch(() => {});
    onFailed(message);
    return '';
  };
  const job = (id: number, deviceId?: number) => {
    let j = jobs.get(id);
    if (!j) {
      const target = (deviceId !== undefined && targetFor(deviceId)) || fallback;
      j = { chain: RDPPrintCreate().catch((e) => fail('', String(e))), target };
      jobs.set(id, j);
    }
    return j;
  };
  const step = (id: number, fn: (h: string) => Promise<unknown>) => {
    const j = job(id);
    j.chain = j.chain.then(async (h) => {
      if (!h) return '';
      try {
        await fn(h);
        return h;
      } catch (e) {
        return fail(h, String(e));
      }
    });
  };
  return {
    onJobStart: (id, deviceId) => void job(id, deviceId),
    onJobData(id, chunk) {
      const copy = chunk.slice(); // the buffer may be reused after the callback
      step(id, (h) => RDPFileWrite(h, toBase64(copy)));
    },
    onJobComplete(id) {
      const { chain, target } = job(id);
      void chain
        .then(async (h) => {
          if (!h) return;
          await RDPPrintFinish(h, true, target.mode, target.printer, title);
          onPrinted(target);
        })
        .catch((e) => onFailed(String(e)))
        .finally(() => jobs.delete(id));
    },
    onJobError(id) {
      void job(id)
        .chain.then((h) => (h ? fail(h, 'The print job failed') : ''))
        .finally(() => jobs.delete(id));
    },
  };
}

/** The PDF printer that every session gets when printers are redirected. */
export const PDF_PRINTER_NAME = 'Terminyxx PDF';

const PDF_DRIVER = 'Microsoft Print to PDF';

/**
 * The printers to announce in a session: this computer's printers (the
 * default one stays the default) and the PDF printer. With "native" drivers
 * the server renders each job with the printer's own driver and the data
 * goes to the printer unchanged; with "universal" ones the server prints to
 * PDF and the PDF is printed here, which works without drivers on the server.
 */
export function sessionPrinters(local: printing.Printer[], drivers: string) {
  const native = drivers === 'native';
  const list: RedirectedPrinter[] = [{ name: PDF_PRINTER_NAME, driverName: PDF_DRIVER, deviceId: 2, network: false }];
  const targets = new Map<number, PrintTarget>([[2, { mode: 'open', printer: '' }]]);
  let id = 3;
  for (const p of local) {
    if (p.name === PDF_PRINTER_NAME) continue;
    list.push({
      name: p.name,
      driverName: native && p.driver ? p.driver : PDF_DRIVER,
      deviceId: id,
      isDefault: p.default,
      network: p.network,
    });
    targets.set(id, { mode: native && p.driver ? 'raw' : 'pdf', printer: p.name });
    id++;
  }
  if (!list.some((p) => p.isDefault)) list[0].isDefault = true;
  return { list, targets };
}
