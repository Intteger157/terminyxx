import { useEffect, useState } from 'react';
import { Environment } from '../../wailsjs/runtime/runtime';

/** Stable hue per host so its avatar and tab dot keep the same color. */
export function hostHue(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function hostColor(key: string, alpha = 1): string {
  return `hsl(${hostHue(key)} 70% 66% / ${alpha})`;
}

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/);
  if (words.length === 0 || !words[0]) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export interface QuickTarget {
  username: string;
  host: string;
  port: number;
}

/** Parses "user@host", "host:2222", "user@[::1]:22" for quick connect. */
export function parseQuickTarget(input: string): QuickTarget | null {
  const m = input.trim().match(/^(?:([^@\s]+)@)?(\[[^\]\s]+\]|[A-Za-z0-9.-]+)(?::(\d{1,5}))?$/);
  if (!m) return null;
  const host = m[2].replace(/^\[|\]$/g, '');
  if (!host.includes('.') && !host.includes(':') && host !== 'localhost' && !m[1]) return null;
  const port = m[3] ? Number(m[3]) : 22;
  if (port < 1 || port > 65535) return null;
  return { username: m[1] ?? '', host, port };
}

export type Platform = 'windows' | 'darwin' | 'linux' | 'unknown';

let cachedPlatform: Platform | null = null;

export function usePlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>(cachedPlatform ?? 'unknown');
  useEffect(() => {
    if (cachedPlatform) return;
    Environment()
      .then((env) => {
        cachedPlatform = (env.platform as Platform) ?? 'unknown';
        setPlatform(cachedPlatform);
      })
      .catch(() => setPlatform('unknown'));
  }, []);
  return platform;
}

export const modKey = (p: Platform) => (p === 'darwin' ? '⌘' : 'Ctrl');
