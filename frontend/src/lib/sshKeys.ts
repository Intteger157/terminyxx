import { useCallback, useEffect, useState } from 'react';
import { ListAgentKeys, ListSSHKeys } from '../../wailsjs/go/main/App';
import type { connection, sshkeys } from '../../wailsjs/go/models';

export type SSHKey = sshkeys.Key;
export type AgentStatus = connection.AgentStatus;

/** Local keys in ~/.ssh and the ssh-agent's keys, with a reload. */
export function useSSHKeys() {
  const [keys, setKeys] = useState<SSHKey[]>([]);
  const [agent, setAgent] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [k, a] = await Promise.all([ListSSHKeys(), ListAgentKeys().catch(() => null)]);
      setKeys(k ?? []);
      setAgent(a);
      setError('');
    } catch (e) {
      setError(String(e).replace(/^Error: /, ''));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { keys, agent, loading, error, reload };
}

/** First free name among id_ed25519, id_ed25519_terminyxx, id_ed25519_2, … */
export function suggestKeyName(keys: SSHKey[]): string {
  const taken = new Set(keys.map((k) => k.name));
  for (const n of ['id_ed25519', 'id_ed25519_terminyxx']) if (!taken.has(n)) return n;
  for (let i = 2; ; i++) if (!taken.has(`id_ed25519_${i}`)) return `id_ed25519_${i}`;
}

/** "SHA256:abcd…wxyz" for narrow rows. */
export function shortFingerprint(fp: string): string {
  return fp.length > 30 ? `${fp.slice(0, 18)}…${fp.slice(-8)}` : fp;
}
