import type { connection, main } from '../../wailsjs/go/models';

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
  /** Saved identity whose login (user, password or key) this host uses. */
  identityId?: string;
  /** Per-host terminal settings. */
  options?: HostOptions;
  /** How the TCP connection reaches the host (or its first jump host). */
  proxy?: ProxySettings;
  /** Forward X11 to the local X server (needs the global switch). */
  x11Forwarding?: boolean;
}

export type ProxyType = '' | 'socks5' | 'http' | 'command';

export interface ProxySettings {
  type: ProxyType | string;
  host: string;
  port: number;
  username: string;
  /** Write-only, like SSHProfile.password. */
  password: string;
  hasPassword?: boolean;
  clearPassword?: boolean;
  /** ProxyCommand: %h, %p, %r are replaced. */
  command: string;
}

/** Star, tags, notes and last use of any saved host. */
export interface HostMeta {
  kind: 'ssh' | 'rdp' | 'stream' | string;
  id: string;
  favorite: boolean;
  tags: string[];
  notes: string;
  /** Unix ms of the last connect, 0 = never. */
  lastUsed: number;
}

export interface HostOptions {
  /** Tag color id from HOST_COLORS ('' = none). */
  color: string;
  /** Typed into the shell after every login, one command per line. */
  startupCommands: string;
  /** Server charset ('' = UTF-8). */
  encoding: string;
  /** Terminal theme for this host ('' = the app's theme). */
  themeId: string;
}

/** A reusable login shared by SSH hosts. */
export interface Identity {
  id: string;
  name: string;
  username: string;
  authType: string;
  /** Write-only, like SSHProfile.password. */
  password: string;
  hasPassword?: boolean;
  clearPassword?: boolean;
  keyPath: string;
  sortOrder?: number;
  /** How many hosts use it (read-only). */
  hosts?: number;
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
  /** Built-in client: share the drives read-only. */
  drivesReadOnly?: boolean;
  /** Built-in client: 'universal' (printed as PDF here) or 'native' (each printer's own driver on the server). */
  printerDrivers: string;
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
  sshDiagnostic?: connection.SSHDiagnostic;
  /** Telnet or serial session (no SSH profile). */
  stream?: StreamSpec;
  /** Built-in RDP session (no SSH profile). */
  rdp?: RDPProfile;
  /** The current single-use RDP session ticket; a new one restarts the pane. */
  rdpSession?: main.RDPSession;
  /** Automatic reconnect after a dropped connection: the next attempt and when it runs (ms). */
  retry?: { attempt: number; at: number };
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
  /** Set when the session comes from a saved connection (StreamProfile). */
  id?: string;
  name?: string;
}

/** A saved Telnet or serial connection (store.StreamProfile). */
export interface StreamProfile extends StreamSpec {
  id: string;
  name: string;
  folderId?: string;
  sortOrder?: number;
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
