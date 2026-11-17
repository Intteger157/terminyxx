import type { FileInfo, FileStorageBackend, FileWriteHandle, PrintJobStreamCallbacks, RdpFileTransferProvider } from '@devolutions/iron-remote-desktop-rdp';
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

/**
 * Receives documents printed to the session's virtual printer. With the
 * "Microsoft Print to PDF" driver each job is a PDF; it is written through Go
 * and opened in the default viewer when the job completes.
 */
export function printSink(onPrinted: (path: string) => void, onFailed: (message: string) => void): PrintJobStreamCallbacks {
  // Writes must reach Go in order, so each job is a promise chain that
  // resolves to the file handle ('' once the job has failed).
  const jobs = new Map<number, Promise<string>>();
  const fail = async (h: string, message: string) => {
    if (h) await RDPPrintFinish(h, false).catch(() => {});
    onFailed(message);
    return '';
  };
  const job = (id: number) => {
    let chain = jobs.get(id);
    if (!chain) {
      chain = RDPPrintCreate().catch((e) => fail('', String(e)));
      jobs.set(id, chain);
    }
    return chain;
  };
  const step = (id: number, fn: (h: string) => Promise<unknown>) => {
    const chain = job(id).then(async (h) => {
      if (!h) return '';
      try {
        await fn(h);
        return h;
      } catch (e) {
        return fail(h, String(e));
      }
    });
    jobs.set(id, chain);
    return chain;
  };
  return {
    onJobStart: (id) => void job(id),
    onJobData(id, chunk) {
      const copy = chunk.slice(); // the buffer may be reused after the callback
      void step(id, (h) => RDPFileWrite(h, toBase64(copy)));
    },
    onJobComplete(id) {
      void job(id)
        .then(async (h) => {
          if (h) onPrinted(await RDPPrintFinish(h, true));
        })
        .catch((e) => onFailed(String(e)))
        .finally(() => jobs.delete(id));
    },
    onJobError(id) {
      void job(id)
        .then((h) => (h ? fail(h, 'The print job failed') : ''))
        .finally(() => jobs.delete(id));
    },
  };
}
