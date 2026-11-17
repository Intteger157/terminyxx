import type { main } from '../../wailsjs/go/models';

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  isLink: boolean;
  size: number;
  mode: string;
  modTime: string;
}

export interface SSHProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: string;
  /** Write-only: a new password to store. Lists return it empty. */
  password: string;
  hasPassword?: boolean;
  clearPassword?: boolean;
  keyPath: string;
  folderId?: string;
  sortOrder?: number;
  /** Allow SHA-1 / CBC algorithms for this host (old routers, switches). */
  allowLegacyAlgorithms?: boolean;
  /** Forward the local ssh-agent (only if the global setting allows it). */
  agentForwarding?: boolean;
  /** Saved host to connect through (ProxyJump). */
  jumpProfileId?: string;
  tunnels?: SavedTunnel[];
  /** The server offers SFTP but no shell: open the file manager, no terminal. */
  sftpOnly?: boolean;
}

export type TunnelKind = 'local' | 'remote' | 'dynamic';

export interface SavedTunnel {
  id: string;
  kind: TunnelKind | string;
  bindHost: string;
  bindPort: number;
  destHost: string;
  destPort: number;
  autoStart: boolean;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string;
  color: string;
  sortOrder: number;
}

export interface RDPOptions {
  clipboard: boolean;
  printers: boolean;
  drives: boolean;
  allDrives: boolean;
  smartCards: boolean;
  comPorts: boolean;
  usb: boolean;
  audio: string; // 'local' | 'remote' | 'off'
  microphone: boolean;
  camera: boolean;
  multiMon: boolean;
  dynamicRes: boolean;
  smartSizing: boolean;
  admin: boolean;
  gateway: string;
  drivePaths: string[];
}

export interface RDPProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  domain: string;
  password: string;
  hasPassword?: boolean;
  clearPassword?: boolean;
  options?: RDPOptions;
  width: number;
  height: number;
  fullscreen: boolean;
  folderId?: string;
  sortOrder?: number;
}

export type TabStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

export interface TerminalTab {
  id: string;
  title: string;
  host: string;
  status: TabStatus;
  /** Set once a shell has run in this tab, so the terminal stays mounted. */
  started: boolean;
  profile?: SSHProfile;
  /** Telnet or serial session (no SSH profile). */
  stream?: StreamSpec;
  /** Built-in RDP session (no SSH profile). */
  rdp?: RDPProfile;
  /** The current single-use RDP session ticket; a new one restarts the pane. */
  rdpSession?: main.RDPSession;
}

export interface StreamSpec {
  kind: 'telnet' | 'serial';
  host: string;
  port: number;
  device: string;
  baud: number;
  dataBits: number;
  parity: string;
  stopBits: string;
}

export interface TransferProgress {
  jobId: string;
  connectionId: string;
  direction: 'upload' | 'download';
  currentFile: string;
  filesDone: number;
  filesTotal: number;
  bytesDone: number;
  bytesTotal: number;
  done: boolean;
  error: string;
}

export type ActivePane = 'local' | 'remote';
