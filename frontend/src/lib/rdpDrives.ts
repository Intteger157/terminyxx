import type { DriveReply, DriveRequest } from '@devolutions/iron-remote-desktop-rdp';

/** STATUS_UNSUCCESSFUL, for a request the app could not be asked. */
const UNSUCCESSFUL = 0xc0000001;
/** A request still unanswered after this long is logged once. */
const SLOW_MS = 3000;
const MAX_PENDING_REQUESTS = 512;
const MAX_BUFFERED_BYTES = 64 * 1024 * 1024;
const TRY_AGAIN_LATER = 1013;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Serves the shared folders of one built-in RDP session. Every filesystem
 * request of the server goes over a WebSocket side channel to Go
 * (`rdpdrive.Serve`, which confines it to the shared folders) and the answer
 * back to the engine through `reply`. The channel bypasses the Wails bridge,
 * whose replies queue behind the window's UI thread: Explorer makes dozens of
 * requests per file, so that latency adds up to seconds per folder.
 *
 * A message is a little-endian uint32 header length, the JSON header and the
 * raw data. Go handles requests in the order sent, which the engine relies on
 * for closes that take no reply (ID 0).
 */
export class DriveChannel {
  private ws: WebSocket;
  private queue: ArrayBuffer[] = [];
  private queuedBytes = 0;
  private pending = new Map<number, { op: string; path?: string; at: number; warned: boolean }>();
  private closed = false;
  private watchdog: number;
  private lastRequest = performance.now();
  private ticks = 0;

  constructor(
    url: string,
    private reply: (r: DriveReply) => void,
    private onAnnounced: (deviceId: number, accepted: boolean) => void,
    private onOverload: () => void,
    /** Adds a `pulse js` line to the drive trace every 2 seconds. */
    private trace = false
  ) {
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () => {
      for (const m of this.queue) this.ws.send(m);
      this.queue = [];
      this.queuedBytes = 0;
    };
    this.ws.onmessage = (e) => this.receive(e.data as ArrayBuffer);
    this.ws.onclose = (event) => {
      if (!this.closed && event.code === TRY_AGAIN_LATER) this.onOverload();
      this.fail();
    };
    this.watchdog = window.setInterval(() => this.checkSlow(), 1000);
  }

  /** The engine's `driveRequestCallback`. */
  readonly handle = (req: DriveRequest) => {
    this.lastRequest = performance.now();
    if (req.op === 'announced') {
      this.onAnnounced(req.deviceId, req.accepted);
      return;
    }
    if (this.closed || this.ws.readyState >= WebSocket.CLOSING) {
      if (req.id) this.reply({ id: req.id, status: UNSUCCESSFUL });
      return;
    }
    const { data, header } = split(req);
    const head = encoder.encode(JSON.stringify(header));
    const size = 4 + head.length + (data?.length ?? 0);
    if (
      this.pending.size >= MAX_PENDING_REQUESTS ||
      this.queue.length >= MAX_PENDING_REQUESTS ||
      size + this.queuedBytes + this.ws.bufferedAmount > MAX_BUFFERED_BYTES
    ) {
      this.close();
      if (req.id) this.reply({ id: req.id, status: UNSUCCESSFUL });
      this.onOverload();
      return;
    }
    if (req.id) {
      const path = 'path' in req ? req.path : undefined;
      this.pending.set(req.id, { op: req.op, path, at: performance.now(), warned: false });
    }
    const msg = new Uint8Array(size);
    new DataView(msg.buffer).setUint32(0, head.length, true);
    msg.set(head, 4);
    if (data) msg.set(data, 4 + head.length);
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(msg.buffer);
    else {
      this.queue.push(msg.buffer);
      this.queuedBytes += size;
    }
  };

  close() {
    window.clearInterval(this.watchdog);
    this.ws.close();
    this.fail();
  }

  private receive(buf: ArrayBuffer) {
    if (this.closed) return;
    const view = new DataView(buf);
    const n = view.getUint32(0, true);
    const r = JSON.parse(decoder.decode(new Uint8Array(buf, 4, n))) as DriveReply;
    if (buf.byteLength > 4 + n) r.data = new Uint8Array(buf, 4 + n);
    const p = this.pending.get(r.id);
    this.pending.delete(r.id);
    if (p?.warned) console.warn(`[drives] ${p.op} ${p.path ?? ''} answered after ${Math.round(performance.now() - p.at)} ms`);
    this.reply(r);
  }

  /** Fails every unanswered request, so the server isn't left waiting. */
  private fail() {
    if (this.closed) return;
    this.closed = true;
    this.queue = [];
    this.queuedBytes = 0;
    window.clearInterval(this.watchdog);
    for (const id of this.pending.keys()) this.reply({ id, status: UNSUCCESSFUL });
    this.pending.clear();
  }

  private checkSlow() {
    const now = performance.now();
    if (this.trace && ++this.ticks % 2 === 0) {
      const last = this.lastRequest;
      this.handle({
        id: 0,
        deviceId: 0,
        fileId: 0,
        op: 'note',
        path: `pulse js: pending=${this.pending.size} ws_buffered=${this.ws.bufferedAmount} queued=${this.queue.length} last_request=${Math.round(now - last)}ms ago`,
      });
      this.lastRequest = last;
    }
    for (const [id, p] of this.pending) {
      if (!p.warned && now - p.at > SLOW_MS) {
        p.warned = true;
        console.warn(`[drives] request ${id} (${p.op} ${p.path ?? ''}) unanswered for ${Math.round(now - p.at)} ms; ${this.pending.size} pending`);
      }
    }
  }
}

function split(req: DriveRequest): { header: Record<string, unknown>; data?: Uint8Array } {
  if (req.op === 'write') {
    const { data, ...header } = req;
    return { header, data };
  }
  return { header: { ...req } };
}
