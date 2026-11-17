export interface NoteLine {
  kind: 'heading' | 'bullet' | 'text';
  text: string;
}

const inline = (s: string) =>
  s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Turns GitHub release notes (Markdown) into a few plain lines for the update
 * box. Everything the dialog already offers is dropped: the title, the
 * downloads table, <details> blocks, code fences, rules and the changelog link.
 */
export function parseReleaseNotes(md: string): NoteLine[] {
  const text = md
    .replace(/\r\n/g, '\n')
    .replace(/<details[\s\S]*?<\/details>/gi, '')
    .replace(/```[\s\S]*?```/g, '');
  const out: NoteLine[] = [];
  let skipSection = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || /^[-*_]{3,}$/.test(line) || line.startsWith('|') || line.startsWith('>')) continue;
    if (/^#\s/.test(line)) continue; // the release title
    const h = /^#{2,6}\s+(.*)$/.exec(line);
    if (h) {
      const t = inline(h[1]);
      skipSection = /^downloads?$/i.test(t);
      if (!skipSection) out.push({ kind: 'heading', text: t });
      continue;
    }
    if (skipSection) continue;
    if (/full changelog|verify downloads|already installed/i.test(line)) continue;
    const b = /^[-*+]\s+(.*)$/.exec(line);
    const t = inline(b ? b[1] : line);
    if (t) out.push({ kind: b ? 'bullet' : 'text', text: t });
  }
  // A heading with nothing under it is noise.
  return out.filter((l, i) => l.kind !== 'heading' || (out[i + 1] && out[i + 1].kind !== 'heading'));
}
