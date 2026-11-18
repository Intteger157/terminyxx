import type { RDPOptions, RDPProfile, SSHProfile, StreamProfile } from '../types';
import { DEFAULT_HOST_OPTIONS } from './hostOptions';
import { rdp, store } from '../../wailsjs/go/models';

// The Go bindings expect every field; fill optional ones before saving.

export function sshForSave(p: SSHProfile) {
  return store.SSHProfile.createFrom({
    ...p,
    jumpProfileId: p.jumpProfileId ?? '',
    tunnels: p.tunnels ?? [],
    hasPassword: !!p.hasPassword,
    clearPassword: !!p.clearPassword,
    folderId: p.folderId ?? '',
    sortOrder: p.sortOrder ?? 0,
    allowLegacyAlgorithms: !!p.allowLegacyAlgorithms,
    agentForwarding: !!p.agentForwarding,
    sftpOnly: !!p.sftpOnly,
    identityId: p.identityId ?? '',
    options: { ...DEFAULT_HOST_OPTIONS, ...p.options },
    x11Forwarding: !!p.x11Forwarding,
    proxy: {
      type: p.proxy?.type ?? '',
      host: p.proxy?.host ?? '',
      port: p.proxy?.port ?? 0,
      username: p.proxy?.username ?? '',
      password: p.proxy?.password ?? '',
      hasPassword: !!p.proxy?.hasPassword,
      clearPassword: !!p.proxy?.clearPassword,
      command: p.proxy?.command ?? '',
    },
  });
}

export function streamForSave(p: StreamProfile) {
  return store.StreamProfile.createFrom({ ...p, folderId: p.folderId ?? '', sortOrder: p.sortOrder ?? 0 });
}

export const DEFAULT_RDP_OPTIONS: RDPOptions = {
  clipboard: true,
  printers: false,
  drives: false,
  allDrives: false,
  smartCards: false,
  comPorts: false,
  usb: false,
  audio: 'local',
  microphone: false,
  camera: false,
  multiMon: false,
  dynamicRes: true,
  smartSizing: false,
  admin: false,
  gateway: '',
  drivePaths: [],
  drivesReadOnly: false,
  printerDrivers: 'universal',
};

export function rdpForSave(p: RDPProfile) {
  return rdp.RDPProfile.createFrom({
    ...p,
    hasPassword: !!p.hasPassword,
    clearPassword: !!p.clearPassword,
    folderId: p.folderId ?? '',
    sortOrder: p.sortOrder ?? 0,
    options: { ...DEFAULT_RDP_OPTIONS, ...p.options },
  });
}
