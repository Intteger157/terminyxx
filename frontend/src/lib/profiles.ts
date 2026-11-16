import type { RDPProfile, SSHProfile } from '../types';

// The Go bindings expect every field; fill optional ones before saving.

export function sshForSave(p: SSHProfile) {
  return {
    ...p,
    hasPassword: !!p.hasPassword,
    clearPassword: !!p.clearPassword,
    folderId: p.folderId ?? '',
    sortOrder: p.sortOrder ?? 0,
    allowLegacyAlgorithms: !!p.allowLegacyAlgorithms,
    agentForwarding: !!p.agentForwarding,
  };
}

export function rdpForSave(p: RDPProfile) {
  return { ...p, folderId: p.folderId ?? '', sortOrder: p.sortOrder ?? 0 };
}
