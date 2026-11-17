import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { Pause, Play } from 'lucide-react';
import { getSettings } from '../../lib/settings';
import { themeById } from '../../lib/themes';
import { terminalOptions } from '../terminal/XTermWrapper';
import { ReadRecording } from '../../../wailsjs/go/main/App';

interface Ev {
  time: number;
  kind: string;
  data: string;
}

/** Longest pause kept during playback; idle time is squeezed to this. */
const MAX_GAP = 1.5;

/** Playback time of every event, with long idle gaps squeezed. */
function squeeze(events: Ev[]): number[] {
  const out: number[] = [];
  let shift = 0;
  let prev = 0;
  for (const e of events) {
    const gap = e.time - prev;
    if (gap > MAX_GAP) shift += gap - MAX_GAP;
    out.push(e.time - shift);
    prev = e.time;
  }
  return out;
}

const SPEEDS = [0.5, 1, 2, 4];

export function RecordingPlayer({ name }: { name: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const eventsRef = useRef<Ev[]>([]);
  const timesRef = useRef<number[]>([]);
  const indexRef = useRef(0); // next event to play
  const clockRef = useRef(0); // playback position in seconds
  const timerRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);
  const speedRef = useRef(1);
  const sizeRef = useRef({ cols: 120, rows: 30 });
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState('');
  speedRef.current = speed;

  const apply = useCallback((e: Ev) => {
    const term = termRef.current;
    if (!term) return;
    if (e.kind === 'o') term.write(e.data);
    else if (e.kind === 'r') {
      const m = /^(\d+)x(\d+)$/.exec(e.data);
      if (m) term.resize(Number(m[1]), Number(m[2]));
    }
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    setPlaying(false);
  }, []);

  const tick = useCallback(() => {
    const now = performance.now();
    clockRef.current += ((now - lastTickRef.current) / 1000) * speedRef.current;
    lastTickRef.current = now;
    const events = eventsRef.current;
    const times = timesRef.current;
    while (indexRef.current < events.length && times[indexRef.current] <= clockRef.current) {
      apply(events[indexRef.current++]);
    }
    const end = times.length ? times[times.length - 1] : 0;
    setPosition(Math.min(clockRef.current, end));
    if (indexRef.current >= events.length) stop();
  }, [apply, stop]);

  const play = useCallback(() => {
    if (indexRef.current >= eventsRef.current.length) seek(0);
    lastTickRef.current = performance.now();
    if (timerRef.current === null) timerRef.current = window.setInterval(tick, 33);
    setPlaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  /** Jump to time t by replaying everything before it instantly. */
  const seek = (t: number) => {
    const term = termRef.current;
    if (!term) return;
    term.reset();
    term.resize(sizeRef.current.cols, sizeRef.current.rows); // later 'r' events replay below
    indexRef.current = 0;
    clockRef.current = t;
    const times = timesRef.current;
    while (indexRef.current < eventsRef.current.length && times[indexRef.current] <= t) {
      apply(eventsRef.current[indexRef.current++]);
    }
    setPosition(t);
  };

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    ReadRecording(name)
      .then((rec) => {
        if (cancelled) return;
        const s = getSettings();
        sizeRef.current = { cols: rec.info.cols || 120, rows: rec.info.rows || 30 };
        const term = new Terminal({ ...terminalOptions(s), cols: sizeRef.current.cols, rows: sizeRef.current.rows, scrollback: 5000, disableStdin: true, cursorBlink: false });
        term.open(host);
        host.style.background = themeById(s.appearance.themeId).colors.background;
        termRef.current = term;
        eventsRef.current = (rec.events ?? []) as Ev[];
        timesRef.current = squeeze(eventsRef.current);
        const end = timesRef.current.length ? timesRef.current[timesRef.current.length - 1] : 0;
        setDuration(end);
        play();
      })
      .catch((e) => setError(String(e).replace(/^Error: /, '')));
    return () => {
      cancelled = true;
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      termRef.current?.dispose();
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  return (
    <div className="space-y-2">
      {error && <p className="text-[12.5px] text-red-300">{error}</p>}
      <div className="rounded-lg overflow-auto max-h-[52vh] bg-black/40 p-2">
        <div ref={hostRef} />
      </div>
      <div className="flex items-center gap-3">
        <button className="icon-btn text-accent" aria-label={playing ? 'Pause' : 'Play'} onClick={() => (playing ? stop() : play())}>
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <input
          className="flex-1"
          type="range"
          min={0}
          max={Math.max(duration, 0.01)}
          step={0.05}
          value={position}
          aria-label="Position"
          onChange={(e) => {
            const was = playing;
            stop();
            seek(Number(e.target.value));
            if (was) play();
          }}
        />
        <span className="font-mono text-2xs tabular-nums text-gray-500 w-[70px] text-right">
          {fmt(position)} / {fmt(duration)}
        </span>
        <div className="flex gap-1">
          {SPEEDS.map((s) => (
            <button key={s} className={`h-6 px-1.5 rounded text-2xs ${s === speed ? 'bg-accent/15 text-accent' : 'text-gray-500 hover:text-gray-300'}`} onClick={() => setSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
      </div>
      <p className="text-2xs text-gray-600">Pauses longer than {MAX_GAP} s are shortened during playback.</p>
    </div>
  );
}
