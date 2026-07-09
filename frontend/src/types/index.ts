export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modTime: string;
}

export interface SSHProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: string;
  password: string;
  keyPath: string;
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
}

export interface ConnectRequest {
  id: string;
  host: string;
  port: number;
  username: string;
  authType: string;
  password: string;
  keyPath: string;
}

export interface TerminalTab {
  id: string;
  title: string;
  profileId?: string;
  connected: boolean;
  host: string;
}

export interface TransferProgress {
  connectionId: string;
  operation: string;
  path: string;
  transferred: number;
  total: number;
}

export type ActivePane = 'local' | 'remote';
