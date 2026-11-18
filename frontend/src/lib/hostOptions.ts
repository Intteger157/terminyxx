import type { HostOptions, SSHProfile } from '../types';

export const DEFAULT_HOST_OPTIONS: HostOptions = { color: '', startupCommands: '', encoding: '', themeId: '' };

/** Tag colors for hosts, e.g. red for production. */
export const HOST_COLORS = [
  { id: 'red', label: 'Red', value: '#ef4444' },
  { id: 'orange', label: 'Orange', value: '#f97316' },
  { id: 'yellow', label: 'Yellow', value: '#eab308' },
  { id: 'green', label: 'Green', value: '#22c55e' },
  { id: 'blue', label: 'Blue', value: '#3b82f6' },
  { id: 'purple', label: 'Purple', value: '#a855f7' },
] as const;

export function tagColor(id: string | undefined): string | undefined {
  return HOST_COLORS.find((c) => c.id === id)?.value;
}

export function hostTagColor(p: SSHProfile | undefined): string | undefined {
  return tagColor(p?.options?.color);
}

/** Terminal encodings the backend can convert (see internal/connection/charset.go). */
export const ENCODINGS = [
  { value: '', label: 'UTF-8 (default)' },
  { value: 'windows-1251', label: 'Windows-1251 (Cyrillic)' },
  { value: 'koi8-r', label: 'KOI8-R (Russian)' },
  { value: 'koi8-u', label: 'KOI8-U (Ukrainian)' },
  { value: 'cp866', label: 'CP866 (DOS Cyrillic)' },
  { value: 'iso-8859-5', label: 'ISO-8859-5 (Cyrillic)' },
  { value: 'windows-1252', label: 'Windows-1252 (Western)' },
  { value: 'iso-8859-1', label: 'ISO-8859-1 (Latin-1)' },
  { value: 'iso-8859-2', label: 'ISO-8859-2 (Central European)' },
  { value: 'windows-1250', label: 'Windows-1250 (Central European)' },
];
