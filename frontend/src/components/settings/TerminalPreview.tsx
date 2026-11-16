import { useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { fontStack } from '../../lib/settings';
import type { AppSettings } from '../../lib/settings';
import { themeById } from '../../lib/themes';
import { OutputHighlighter, compileRules } from '../../lib/highlight';

// Sample session: a mix of plain output (gets highlighted) and output that the
// program colors itself (left alone), like a real shell.
const SAMPLE = [
  '\x1b[1;32mroot@web-01\x1b[0m:\x1b[1;34m~\x1b[0m# systemctl status nginx',
  '\x1b[32m●\x1b[0m nginx.service - A high performance web server',
  '     Active: \x1b[1;32mactive (running)\x1b[0m since Mon 2026-11-16 09:12:44 UTC',
  'Nov 16 09:14:02 web-01 nginx[812]: connect() failed (111: Connection refused) to 10.0.4.17:8080',
  'Nov 16 09:14:05 web-01 nginx[812]: warning: upstream timed out, retrying',
  'Nov 16 09:14:06 web-01 nginx[812]: upstream 10.0.4.18:8080 is healthy, status OK',
  '\x1b[1;32mroot@web-01\x1b[0m:\x1b[1;34m~\x1b[0m# ls',
  '\x1b[1;34mbackups\x1b[0m  \x1b[1;31mdump.tar.gz\x1b[0m  notes.txt  \x1b[1;32mdeploy.sh\x1b[0m',
].join('\r\n');

const ANSI_KEYS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'] as const;

/** Renders the sample with the given settings, using the same highlighter as the terminal. */
export function TerminalPreview({ settings, className = '' }: { settings: AppSettings; className?: string }) {
  const theme = themeById(settings.appearance.themeId).colors;
  const html = useMemo(() => {
    const rules = settings.highlight.enabled ? compileRules(settings.highlight.rules) : [];
    const out = new OutputHighlighter(() => rules).process(SAMPLE);
    return renderAnsi(out, theme as unknown as Record<string, string>);
  }, [settings.highlight, theme]);

  const style: CSSProperties = {
    background: theme.background,
    color: theme.foreground,
    fontFamily: fontStack(settings.appearance.fontFamily),
    fontSize: settings.appearance.fontSize,
    lineHeight: settings.appearance.lineHeight,
  };
  return (
    <div className={`rounded-xl border border-border overflow-hidden ${className}`}>
      <pre className="m-0 px-3.5 py-3 overflow-x-auto whitespace-pre" style={style}>
        {html}
        <Cursor settings={settings} color={theme.cursor ?? theme.foreground} />
      </pre>
    </div>
  );
}

function Cursor({ settings, color }: { settings: AppSettings; color: string }) {
  const { cursorStyle, cursorBlink } = settings.appearance;
  const s: CSSProperties =
    cursorStyle === 'block'
      ? { background: color, width: '0.6em', height: '1.1em', verticalAlign: 'text-bottom' }
      : cursorStyle === 'underline'
        ? { borderBottom: `2px solid ${color}`, width: '0.6em', height: '1em', verticalAlign: 'text-bottom' }
        : { background: color, width: 2, height: '1.1em', verticalAlign: 'text-bottom' };
  return <span className={`inline-block ml-px ${cursorBlink ? 'animate-blink' : ''}`} style={s} />;
}

/** Minimal SGR renderer: colors (16), bold and underline. */
function renderAnsi(text: string, theme: Record<string, string>): ReactNode[] {
  const nodes: ReactNode[] = [];
  let fg: string | undefined;
  let bold = false;
  let underline = false;
  const re = /\x1b\[([\d;]*)m/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const push = (s: string) => {
    if (!s) return;
    const lines = s.split('\r\n');
    lines.forEach((line, i) => {
      if (i > 0) nodes.push('\n');
      if (line)
        nodes.push(
          <span key={nodes.length} style={{ color: fg, fontWeight: bold ? 600 : undefined, textDecoration: underline ? 'underline' : undefined }}>
            {line}
          </span>
        );
    });
  };
  while ((m = re.exec(text))) {
    push(text.slice(last, m.index));
    last = m.index + m[0].length;
    for (const raw of (m[1] || '0').split(';')) {
      const p = Number(raw || 0);
      if (p === 0) {
        fg = undefined;
        bold = false;
        underline = false;
      } else if (p === 1) bold = true;
      else if (p === 22) bold = false;
      else if (p === 4) underline = true;
      else if (p === 24) underline = false;
      else if (p === 39) fg = undefined;
      else if (p >= 30 && p <= 37) fg = theme[ANSI_KEYS[p - 30]];
      else if (p >= 90 && p <= 97) fg = theme['bright' + ANSI_KEYS[p - 90][0].toUpperCase() + ANSI_KEYS[p - 90].slice(1)];
    }
  }
  push(text.slice(last));
  return nodes;
}
