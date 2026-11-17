import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import type { TerminalTab } from '../../types';
import { HostStats } from '../../../wailsjs/go/main/App';
import type { connection } from '../../../wailsjs/go/models';

const KEY = 'terminyxx.monitor';
const INTERVAL = 3000;

function readEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function bytes(n: number): string {
  const u = ['B', 'K', 'M', 'G', 'T'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)}${u[i]}`;
}

function uptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const tone = (pct: number) => (pct >= 90 ? 'text-red-300' : pct >= 70 ? 'text-amber-300' : 'text-gray-300');

/**
 * Status bar readout of the server's load. Off by default because it runs a
 * short command over the SSH connection every few seconds.
 */
export function HostMonitor({ tab }: { tab: TerminalTab }) {
  const [enabled, setEnabled] = useState(readEnabled);
  const [stats, setStats] = useState<connection.HostStats | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    setStats(null);
    setUnsupported(false);
    try {
      localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      // storage unavailable: the choice just won't be remembered
    }
  };

  useEffect(() => {
    setStats(null);
    setUnsupported(false);
    if (!enabled || tab.status !== 'connected') return;
    let cancelled = false;
    let failures = 0;
    const poll = async () => {
      try {
        const s = await HostStats(tab.id);
        if (cancelled) return;
        failures = 0;
        setStats(s);
      } catch (e) {
        if (cancelled) return;
        if (String(e).includes('needs a Linux host')) {
          setUnsupported(true);
          return;
        }
        if (++failures >= 3) setStats(null);
      }
      if (!cancelled && !document.hidden) timer = window.setTimeout(poll, INTERVAL);
      else if (!cancelled) timer = window.setTimeout(poll, INTERVAL * 3);
    };
    let timer = window.setTimeout(poll, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, tab.id, tab.status]);

  const mem = stats && stats.memTotal > 0 ? (100 * stats.memUsed) / stats.memTotal : 0;
  const disk = stats && stats.diskTotal > 0 ? (100 * stats.diskUsed) / stats.diskTotal : 0;
  const detail = stats
    ? [
        `Load ${stats.load1.toFixed(2)} ${stats.load5.toFixed(2)} ${stats.load15.toFixed(2)} (${stats.cores || '?'} cores)`,
        `Memory ${bytes(stats.memUsed)} of ${bytes(stats.memTotal)}`,
        stats.swapTotal > 0 ? `Swap ${bytes(stats.swapUsed)} of ${bytes(stats.swapTotal)}` : 'No swap',
        `Disk / ${bytes(stats.diskUsed)} of ${bytes(stats.diskTotal)}`,
        `Uptime ${uptime(stats.uptimeSec)}`,
      ].join('\n')
    : '';

  return (
    <>
      {enabled && stats && (
        <span className="flex items-center gap-2.5 font-mono tabular-nums flex-shrink-0" title={detail}>
          <span>
            CPU <span className={tone(Math.max(stats.cpuPercent, 0))}>{stats.cpuPercent < 0 ? '…' : `${Math.round(stats.cpuPercent)}%`}</span>
          </span>
          <span>
            RAM <span className={tone(mem)}>{Math.round(mem)}%</span>
          </span>
          <span>
            Disk <span className={tone(disk)}>{Math.round(disk)}%</span>
          </span>
          {stats.rxPerSec >= 0 && (
            <span className="text-gray-400">
              ↓{bytes(stats.rxPerSec)}/s ↑{bytes(stats.txPerSec)}/s
            </span>
          )}
        </span>
      )}
      {enabled && unsupported && <span className="flex-shrink-0 text-gray-600">Monitoring needs a Linux host</span>}
      <button
        className={`flex items-center h-5 px-1.5 rounded-md transition-colors flex-shrink-0 ${enabled ? 'bg-accent/15 text-accent' : 'hover:bg-white/[0.06] hover:text-gray-300'}`}
        onClick={toggle}
        aria-pressed={enabled}
        title={enabled ? 'Stop reading server load' : 'Show server load (runs a short command over SSH every few seconds)'}
      >
        <Activity size={11} />
      </button>
    </>
  );
}
