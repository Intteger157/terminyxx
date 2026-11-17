import type { RDPOptions, RDPProfile, SSHProfile } from '../types';
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
  });
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
