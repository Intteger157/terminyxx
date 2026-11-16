import type { ITheme } from '@xterm/xterm';

export interface TerminalTheme {
  id: string;
  name: string;
  light?: boolean;
  colors: ITheme & { background: string; foreground: string };
}

const ansi = (normal: string[], bright: string[]) => ({
  black: normal[0],
  red: normal[1],
  green: normal[2],
  yellow: normal[3],
  blue: normal[4],
  magenta: normal[5],
  cyan: normal[6],
  white: normal[7],
  brightBlack: bright[0],
  brightRed: bright[1],
  brightGreen: bright[2],
  brightYellow: bright[3],
  brightBlue: bright[4],
  brightMagenta: bright[5],
  brightCyan: bright[6],
  brightWhite: bright[7],
});

const base = (background: string, foreground: string, cursor: string, selection: string) => ({
  background,
  foreground,
  cursor,
  cursorAccent: background,
  selectionBackground: selection,
  selectionInactiveBackground: selection.replace(/[\d.]+\)$/, (a) => `${(parseFloat(a) / 1.8).toFixed(2)})`),
});

export const THEMES: TerminalTheme[] = [
  {
    id: 'terminyxx',
    name: 'Terminyxx',
    // Matches the app's --surface token so the terminal blends into its card.
    colors: {
      ...base('#0e0f13', '#d9dbe3', '#9a8cff', 'rgba(132, 116, 255, 0.32)'),
      ...ansi(
        ['#23252e', '#ff6b81', '#7ee2a8', '#f6d58a', '#7aa7ff', '#c7a1ff', '#6fdbe8', '#d0d3dc'],
        ['#5b5f6e', '#ff8da0', '#a3f0c3', '#fbe3a8', '#a1c1ff', '#dcc3ff', '#9ae9f2', '#f4f5f8']
      ),
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    colors: {
      ...base('#282a36', '#f8f8f2', '#f8f8f2', 'rgba(98, 114, 164, 0.5)'),
      ...ansi(
        ['#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2'],
        ['#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff']
      ),
    },
  },
  {
    id: 'one-dark',
    name: 'One Dark',
    colors: {
      ...base('#282c34', '#abb2bf', '#528bff', 'rgba(97, 175, 239, 0.28)'),
      ...ansi(
        ['#3f4451', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#abb2bf'],
        ['#5c6370', '#ef7b85', '#a5d68a', '#f0cf8f', '#74bcf7', '#d58ce9', '#6cc8d4', '#ffffff']
      ),
    },
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    colors: {
      ...base('#1a1b26', '#c0caf5', '#c0caf5', 'rgba(51, 70, 124, 0.7)'),
      ...ansi(
        ['#15161e', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#a9b1d6'],
        ['#414868', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#c0caf5']
      ),
    },
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    colors: {
      ...base('#1e1e2e', '#cdd6f4', '#f5e0dc', 'rgba(88, 91, 112, 0.6)'),
      ...ansi(
        ['#45475a', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#bac2de'],
        ['#585b70', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#a6adc8']
      ),
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    colors: {
      ...base('#2e3440', '#d8dee9', '#d8dee9', 'rgba(76, 86, 106, 0.7)'),
      ...ansi(
        ['#3b4252', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#e5e9f0'],
        ['#4c566a', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#8fbcbb', '#eceff4']
      ),
    },
  },
  {
    id: 'gruvbox-dark',
    name: 'Gruvbox Dark',
    colors: {
      ...base('#282828', '#ebdbb2', '#ebdbb2', 'rgba(102, 92, 84, 0.6)'),
      ...ansi(
        ['#3c3836', '#cc241d', '#98971a', '#d79921', '#458588', '#b16286', '#689d6a', '#a89984'],
        ['#928374', '#fb4934', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#8ec07c', '#ebdbb2']
      ),
    },
  },
  {
    id: 'monokai',
    name: 'Monokai',
    colors: {
      ...base('#272822', '#f8f8f2', '#f8f8f0', 'rgba(117, 113, 94, 0.55)'),
      ...ansi(
        ['#3e3d32', '#f92672', '#a6e22e', '#f4bf75', '#66d9ef', '#ae81ff', '#a1efe4', '#f8f8f2'],
        ['#75715e', '#f92672', '#a6e22e', '#f4bf75', '#66d9ef', '#ae81ff', '#a1efe4', '#f9f8f5']
      ),
    },
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    colors: {
      ...base('#002b36', '#839496', '#93a1a1', 'rgba(7, 54, 66, 0.9)'),
      ...ansi(
        ['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5'],
        ['#586e75', '#cb4b16', '#93a1a1', '#b58900', '#839496', '#6c71c4', '#2aa198', '#fdf6e3']
      ),
    },
  },
  {
    id: 'classic',
    name: 'Classic Black',
    colors: {
      ...base('#000000', '#cccccc', '#ffffff', 'rgba(255, 255, 255, 0.25)'),
      ...ansi(
        ['#000000', '#cd3131', '#0dbc79', '#e5e510', '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5'],
        ['#666666', '#f14c4c', '#23d18b', '#f5f543', '#3b8eea', '#d670d6', '#29b8db', '#ffffff']
      ),
    },
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    light: true,
    colors: {
      ...base('#fdf6e3', '#586e75', '#586e75', 'rgba(147, 161, 161, 0.35)'),
      ...ansi(
        ['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5'],
        ['#002b36', '#cb4b16', '#586e75', '#657b83', '#839496', '#6c71c4', '#93a1a1', '#fdf6e3']
      ),
    },
  },
  {
    id: 'github-light',
    name: 'Light',
    light: true,
    // Saturated, darker-than-usual accents: stock palettes look washed out on white.
    colors: {
      ...base('#ffffff', '#1f2328', '#0a5cd8', 'rgba(9, 105, 218, 0.22)'),
      ...ansi(
        ['#1f2328', '#d1001f', '#00873c', '#b35c00', '#0a5cd8', '#a20fc4', '#007a8a', '#6e7781'],
        ['#57606a', '#e5001f', '#009a44', '#c26300', '#1f6feb', '#b416d8', '#008a9c', '#8c959f']
      ),
    },
  },
];

// Light backgrounds wash out the stock accent colors (Solarized's are ~3:1),
// so on light themes every chromatic color is darkened until it reads clearly.
// Highlighting and colored program output both use these colors.
const LIGHT_MIN_CONTRAST = 4.6;
const CHROMATIC = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'].flatMap((c) => [c, 'bright' + c[0].toUpperCase() + c.slice(1)]);
for (const t of THEMES) {
  if (!t.light) continue;
  const c = t.colors as unknown as Record<string, string>;
  for (const k of CHROMATIC) c[k] = ensureContrast(c[k], c.background, LIGHT_MIN_CONTRAST);
}

export const DEFAULT_THEME = THEMES[0];

export function themeById(id: string): TerminalTheme {
  return THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;
}

function rgb(hex: string): number[] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: number[]): number {
  return [r, g, b]
    .map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    })
    .reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0);
}

function ratio(a: number[], b: number[]): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Darkens (on light backgrounds) or lightens `fg` until it reaches `min`
 * contrast. Only lightness changes and saturation is raised, so the color
 * stays vivid instead of turning muddy like a mix with black would.
 */
export function ensureContrast(fg: string, bg: string, min: number): string {
  const b = rgb(bg);
  if (ratio(rgb(fg), b) >= min) return fg;
  const [h, sat, l] = toHsl(rgb(fg));
  const darken = luminance(b) > 0.5;
  const s2 = Math.max(sat, 0.85);
  // Binary search for the lightness closest to the original that passes.
  let lo = darken ? 0 : l;
  let hi = darken ? l : 1;
  for (let n = 0; n < 24; n++) {
    const mid = (lo + hi) / 2;
    const ok = ratio(fromHsl(h, s2, mid), b) >= min;
    if (darken) {
      if (ok) lo = mid;
      else hi = mid;
    } else if (ok) hi = mid;
    else lo = mid;
  }
  const c = fromHsl(h, s2, darken ? lo : hi);
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

function toHsl([r, g, b]: number[]): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function fromHsl(h: number, s: number, l: number): number[] {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [ch(h + 1 / 3), ch(h), ch(h - 1 / 3)].map((v) => Math.round(v * 255));
}
