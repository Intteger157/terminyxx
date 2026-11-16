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
}

export interface Folder {
  id: string;
  name: string;
  parentId: string;
  color: string;
  sortOrder: number;
}

export interface RDPProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  domain: string;
  password: string;
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
