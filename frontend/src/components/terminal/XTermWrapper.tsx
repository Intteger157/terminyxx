import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useWailsEvent } from '../../hooks/useWailsEvents';
import { SSHResizePTY, SSHWriteInput } from '../../../wailsjs/go/main/App';

interface XTermWrapperProps {
  connectionId: string;
  active: boolean;
  onDisconnected?: () => void;
}

export function XTermWrapper({ connectionId, active, onDisconnected }: XTermWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#0f1419',
        foreground: '#e2e8f0',
        cursor: '#3b82f6',
        selectionBackground: '#3b82f640',
      },
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fitAddon.fit();

    term.onData((data) => {
      SSHWriteInput(connectionId, data).catch(console.error);
    });

    termRef.current = term;
    fitRef.current = fitAddon;

    const resizeObserver = new ResizeObserver(() => {
      if (!fitRef.current || !termRef.current) return;
      fitRef.current.fit();
      SSHResizePTY(connectionId, term.cols, term.rows).catch(() => {});
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [connectionId]);

  useEffect(() => {
    if (active && fitRef.current) {
      requestAnimationFrame(() => fitRef.current?.fit());
    }
  }, [active]);

  useWailsEvent<string>(`terminal:output:${connectionId}`, (data) => {
    termRef.current?.write(data);
  }, [connectionId]);

  useWailsEvent<void>(`terminal:closed:${connectionId}`, () => {
    onDisconnected?.();
  }, [connectionId, onDisconnected]);

  return (
    <div
      ref={containerRef}
      className={`h-full w-full ${active ? 'block' : 'hidden'}`}
    />
  );
}
