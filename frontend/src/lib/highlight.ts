import type { HighlightColor, HighlightRule } from './settings';

/**
 * Keyword highlighting for terminal output.
 *
 * The output stream is rewritten before it reaches xterm: matches in plain
 * text get SGR color codes around them. It is deliberately conservative so it
 * never fights the remote program:
 *  - only text printed in the default foreground color is touched (output
 *    that a program already colored, like `ls` or `systemctl`, is left alone);
 *  - nothing is touched on the alternate screen (vim, htop, less, mc…);
 *  - escape sequences are never split or altered; an incomplete one at the
 *    end of a chunk is held back until the next chunk.
 * A match split across two output chunks is not highlighted.
 */

const SGR_FG: Record<HighlightColor, number> = {
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  brightRed: 91,
  brightGreen: 92,
  brightYellow: 93,
  brightBlue: 94,
  brightMagenta: 95,
  brightCyan: 96,
};

interface CompiledRule {
  re: RegExp;
  on: string;
  bold: boolean;
  underline: boolean;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Builds the regex for a rule, or null when the pattern is empty or invalid. */
export function compileRule(rule: Pick<HighlightRule, 'pattern' | 'regex' | 'caseSensitive'>): RegExp | null {
  const flags = rule.caseSensitive ? 'g' : 'gi';
  try {
    if (rule.regex) {
      if (!rule.pattern.trim()) return null;
      const re = new RegExp(rule.pattern, flags);
      return re.test('') ? null : re; // a pattern that matches "" would loop
    }
    const words = rule.pattern
      .split(',')
      .map((w) => w.trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length); // longest first: "timed out" before "timed"
    if (!words.length) return null;
    // \b only works next to word characters; use lookarounds so words that
    // start or end with punctuation still match on their own.
    return new RegExp(`(?<![\\w-])(?:${words.map(escapeRe).join('|')})(?![\\w-])`, flags);
  } catch {
    return null;
  }
}

export function compileRules(rules: HighlightRule[]): CompiledRule[] {
  const out: CompiledRule[] = [];
  for (const r of rules) {
    if (!r.enabled) continue;
    const re = compileRule(r);
    if (!re) continue;
    out.push({ re, on: String(SGR_FG[r.color] ?? 33), bold: r.bold, underline: r.underline });
  }
  return out;
}

export class OutputHighlighter {
  private carry = '';
  private fgDefault = true;
  private bold = false;
  private underline = false;
  private altScreen = false;

  constructor(private rules: () => CompiledRule[]) {}

  /** Clears the tracked terminal state (e.g. after a reconnect). */
  reset() {
    this.carry = '';
    this.fgDefault = true;
    this.bold = false;
    this.underline = false;
    this.altScreen = false;
  }

  process(chunk: string): string {
    const data = this.carry + chunk;
    this.carry = '';
    const rules = this.rules();
    let out = '';
    let i = 0;
    while (i < data.length) {
      const esc = data.indexOf('\x1b', i);
      const textEnd = esc === -1 ? data.length : esc;
      if (textEnd > i) {
        const text = data.slice(i, textEnd);
        out += rules.length && this.fgDefault && !this.altScreen ? this.highlight(text, rules) : text;
      }
      if (esc === -1) break;
      const end = sequenceEnd(data, esc);
      if (end === -1) {
        // Incomplete escape sequence: hold it back unless it is absurdly long.
        if (data.length - esc < 4096) this.carry = data.slice(esc);
        else out += data.slice(esc);
        break;
      }
      const seq = data.slice(esc, end);
      this.track(seq);
      out += seq;
      i = end;
    }
    return out;
  }

  private highlight(text: string, rules: CompiledRule[]): string {
    const hits: { start: number; end: number; rule: CompiledRule; order: number }[] = [];
    rules.forEach((rule, order) => {
      rule.re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = rule.re.exec(text))) {
        if (m[0].length === 0) {
          rule.re.lastIndex++;
          continue;
        }
        hits.push({ start: m.index, end: m.index + m[0].length, rule, order });
      }
    });
    if (!hits.length) return text;
    // Earlier position wins; at the same position the earlier rule wins.
    hits.sort((a, b) => a.start - b.start || a.order - b.order);
    let out = '';
    let pos = 0;
    for (const h of hits) {
      if (h.start < pos) continue;
      const on = [h.rule.on];
      const off = ['39'];
      if (h.rule.bold && !this.bold) {
        on.push('1');
        off.push('22');
      }
      if (h.rule.underline && !this.underline) {
        on.push('4');
        off.push('24');
      }
      out += text.slice(pos, h.start) + `\x1b[${on.join(';')}m` + text.slice(h.start, h.end) + `\x1b[${off.join(';')}m`;
      pos = h.end;
    }
    return out + text.slice(pos);
  }

  /** Follows SGR colors and the alternate screen from the remote side. */
  private track(seq: string) {
    if (seq[1] !== '[') return;
    const final = seq[seq.length - 1];
    const body = seq.slice(2, -1);
    if (final === 'm' && !/^[<=>?]/.test(body)) {
      const ps = body.split(/[;:]/);
      for (let k = 0; k < ps.length; k++) {
        const p = ps[k] === '' ? 0 : Number(ps[k]);
        if (p === 0) {
          this.fgDefault = true;
          this.bold = false;
          this.underline = false;
        } else if (p === 1) this.bold = true;
        else if (p === 22) this.bold = false;
        else if (p === 4) this.underline = true;
        else if (p === 24) this.underline = false;
        else if (p === 39) this.fgDefault = true;
        else if ((p >= 30 && p <= 37) || (p >= 90 && p <= 97)) this.fgDefault = false;
        else if (p === 38) {
          this.fgDefault = false;
          k += ps[k + 1] === '5' ? 2 : ps[k + 1] === '2' ? 4 : 0;
        } else if (p === 48 || p === 58) {
          k += ps[k + 1] === '5' ? 2 : ps[k + 1] === '2' ? 4 : 0;
        }
      }
    } else if ((final === 'h' || final === 'l') && body.startsWith('?')) {
      const modes = body.slice(1).split(';');
      if (modes.some((m) => m === '1049' || m === '1047' || m === '47')) this.altScreen = final === 'h';
    }
  }
}

/** Index just past the escape sequence starting at `i`, or -1 if it is incomplete. */
function sequenceEnd(s: string, i: number): number {
  const next = s[i + 1];
  if (next === undefined) return -1;
  if (next === '[') {
    for (let k = i + 2; k < s.length; k++) {
      const c = s.charCodeAt(k);
      if (c >= 0x40 && c <= 0x7e) return k + 1;
      if (c < 0x20) return k; // malformed: pass it through as is
    }
    return -1;
  }
  if (next === ']') {
    // OSC: terminated by BEL or ST (ESC \)
    for (let k = i + 2; k < s.length; k++) {
      if (s[k] === '\x07') return k + 1;
      if (s[k] === '\x1b') return s[k + 1] === undefined ? -1 : s[k + 1] === '\\' ? k + 2 : k;
    }
    return -1;
  }
  if (next === 'P' || next === '_' || next === '^' || next === 'X') {
    const st = s.indexOf('\x1b\\', i + 2);
    return st === -1 ? -1 : st + 2;
  }
  if ('()*+-./#%'.includes(next)) return s[i + 2] === undefined ? -1 : i + 3;
  return i + 2;
}
