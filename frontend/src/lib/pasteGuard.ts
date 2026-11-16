import type { AppSettings } from './settings';

/** Why a paste needs confirmation; empty = paste right away. */
export interface PasteCheck {
  multiline: boolean;
  lines: number;
  /** Labels of dangerous commands found. */
  dangerous: string[];
  /** Escape sequences, control or invisible characters (pastejacking). */
  hidden: string[];
}

const DANGEROUS: { label: string; test: (s: string) => boolean }[] = [
  { label: 'rm -rf: forced recursive delete', test: hasForcedRecursiveRm },
  { label: 'mkfs: formats a filesystem', test: (s) => /\bmkfs(?:\.\w+)?\b/.test(s) },
  { label: 'dd: raw copy to or from a device', test: (s) => /\bdd\b[^\n;|&]*\b(?:if|of)=/.test(s) },
  { label: 'Fork bomb', test: (s) => /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(s) || /\b(\w+)\s*\(\s*\)\s*\{\s*\1\s*\|\s*\1\s*&\s*\}/.test(s) },
  { label: 'Shutdown / reboot', test: (s) => /(?:^|[\s;&|(`])(?:sudo\s+)?(?:shutdown|reboot|poweroff|halt)\b/.test(s) || /\b(?:init|telinit)\s+[06]\b/.test(s) || /\bsystemctl\s+(?:reboot|poweroff|halt)\b/.test(s) },
  { label: 'chmod -R 777: world-writable files', test: (s) => /\bchmod\s+(?:-\w*R\w*\s+|--recursive\s+)[^\n;|&]*\b0?777\b/.test(s) || /\bchmod\s+0?777\s+\/(?:\s|$)/.test(s) },
  { label: 'chown -R on /', test: (s) => /\bchown\s+(?:-\w*R\w*|--recursive)\s+\S+\s+\/(?:\s|$)/.test(s) },
  { label: 'Writes directly to a disk device', test: (s) => />\s*\/dev\/(?:sd|hd|vd|xvd|nvme|mmcblk|disk)\w*/.test(s) },
  { label: 'Pipes a download into a shell', test: (s) => /\b(?:curl|wget)\b[^\n]*\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b/.test(s) },
  { label: 'Deletes a database or table', test: (s) => /\bdrop\s+(?:database|schema|table)\b/i.test(s) },
  { label: 'Wipes the disk', test: (s) => /\b(?:wipefs|shred)\b[^\n]*\/dev\//.test(s) },
];

function hasForcedRecursiveRm(s: string): boolean {
  const re = /(?:^|[\s;&|(`])(?:sudo\s+)?rm\s+([^\n;&|]*)/g;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    const args = m[1];
    const r = /(?:^|\s)-[a-zA-Z]*[rR]/.test(args) || /(?:^|\s)--recursive\b/.test(args);
    const f = /(?:^|\s)-[a-zA-Z]*f/.test(args) || /(?:^|\s)--force\b/.test(args);
    if ((r && f) || /--no-preserve-root/.test(args)) return true;
  }
  return false;
}

const INVISIBLE: [RegExp, string][] = [
  [/\x1b/, 'Escape sequences'],
  [/[\x00-\x08\x0b\x0c\x0e-\x1a\x1c-\x1f\x7f]/, 'Control characters'],
  [/[​-‏⁠﻿]/, 'Zero-width characters'],
  [/[‪-‮⁦-⁩]/, 'Text direction overrides'],
];

export function checkPaste(text: string, cfg: AppSettings['security']['paste']): PasteCheck {
  const lines = text.split(/\r\n|\r|\n/).length;
  const multiline = cfg.warnMultiline && /[\r\n]/.test(text);
  const dangerous = cfg.warnDangerous ? DANGEROUS.filter((d) => d.test(text)).map((d) => d.label) : [];
  const hidden = cfg.warnDangerous || cfg.warnMultiline ? INVISIBLE.filter(([re]) => re.test(text)).map(([, label]) => label) : [];
  return { multiline, lines, dangerous, hidden };
}

export function needsConfirm(c: PasteCheck): boolean {
  return c.multiline || c.dangerous.length > 0 || c.hidden.length > 0;
}

/** Splits text into visible parts, marking characters that are normally invisible. */
export function visibleParts(text: string): { text: string; special: boolean }[] {
  const parts: { text: string; special: boolean }[] = [];
  const push = (t: string, special: boolean) => {
    const last = parts[parts.length - 1];
    if (last && last.special === special) last.text += t;
    else parts.push({ text: t, special });
  };
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (ch === '\n') push('↵\n', true);
    else if (ch === '\r') push('␍', true);
    else if (ch === '\t') push('⇥', true);
    else if (code === 0x1b) push('␛', true);
    else if (code < 0x20 || code === 0x7f) push(`^${String.fromCharCode(code === 0x7f ? 63 : code + 64)}`, true);
    else if (/[​-‏⁠﻿‪-‮⁦-⁩]/.test(ch)) push(`⟨U+${code.toString(16).toUpperCase().padStart(4, '0')}⟩`, true);
    else push(ch, false);
  }
  return parts;
}
