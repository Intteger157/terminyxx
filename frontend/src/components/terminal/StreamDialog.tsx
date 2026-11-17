import { useEffect, useState } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Modal } from '../ui/Dialogs';
import { Select } from '../ui/Select';
import { Field } from './ConnectDialog';
import type { StreamSpec } from '../../types';
import { SerialPorts } from '../../../wailsjs/go/main/App';

const BAUDS = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
const KEY = 'terminyxx.stream';

function remembered(): Partial<StreamSpec> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

interface Props {
  initial: 'telnet' | 'serial';
  onClose: () => void;
  onConnect: (spec: StreamSpec) => void;
}

/** Quick connect for Telnet and serial ports (not saved to the host list). */
export function StreamDialog({ initial, onClose, onConnect }: Props) {
  const last = remembered();
  const [kind, setKind] = useState<'telnet' | 'serial'>(initial);
  const [host, setHost] = useState(last.host ?? '');
  const [port, setPort] = useState(last.port ?? 23);
  const [device, setDevice] = useState(last.device ?? '');
  const [baud, setBaud] = useState(last.baud ?? 115200);
  const [dataBits, setDataBits] = useState(last.dataBits ?? 8);
  const [parity, setParity] = useState(last.parity ?? 'none');
  const [stopBits, setStopBits] = useState(last.stopBits ?? '1');
  const [ports, setPorts] = useState<string[]>([]);
  const [portError, setPortError] = useState('');

  const refresh = () =>
    SerialPorts()
      .then((l) => {
        setPorts(l ?? []);
        setPortError('');
        setDevice((d) => d || (l && l[0]) || '');
      })
      .catch((e) => setPortError(String(e).replace(/^Error: /, '')));
  useEffect(() => {
    if (kind === 'serial') void refresh();
  }, [kind]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const spec: StreamSpec = { kind, host: host.trim(), port: Number(port) || 23, device: device.trim(), baud, dataBits, parity, stopBits };
    try {
      localStorage.setItem(KEY, JSON.stringify(spec));
    } catch {
      // not remembered
    }
    onConnect(spec);
  };

  const num = (v: string | number) => Number(v);

  return (
    <Modal title="Telnet / serial" subtitle="Quick connection to a network device or a serial console." onClose={onClose}>
      <form onSubmit={submit} className="px-5 pb-5 pt-1 space-y-4">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-black/20">
          {(['telnet', 'serial'] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={`h-7 text-[12.5px] font-medium rounded-lg transition-all ${kind === k ? 'bg-white/[0.09] text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}
              onClick={() => setKind(k)}
            >
              {k === 'telnet' ? 'Telnet' : 'Serial port'}
            </button>
          ))}
        </div>

        {kind === 'telnet' ? (
          <>
            <div className="grid grid-cols-[1fr_88px] gap-2">
              <Field label="Host">
                <input className="input-field font-mono" value={host} onChange={(e) => setHost(e.target.value)} required autoFocus spellCheck={false} />
              </Field>
              <Field label="Port">
                <input className="input-field font-mono" type="number" min={1} max={65535} value={port} onChange={(e) => setPort(num(e.target.value))} />
              </Field>
            </div>
            <p className="flex items-start gap-2 rounded-lg bg-amber-400/10 p-2.5 text-2xs text-amber-200/90">
              <TriangleAlert size={13} className="flex-shrink-0 mt-px" />
              Telnet is not encrypted. Everything you type, including passwords, can be read on the network. Use SSH whenever the device supports it.
            </p>
          </>
        ) : (
          <>
            <Field label="Port" hint={portError || (ports.length === 0 ? 'No serial ports found. Plug the adapter in and refresh.' : undefined)}>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select value={device} options={ports.map((p) => ({ value: p, label: p }))} onChange={setDevice} placeholder="Select a port" />
                </div>
                <button type="button" className="btn-ghost h-8 px-2.5" onClick={() => void refresh()} aria-label="Refresh ports">
                  <RefreshCw size={13} />
                </button>
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Baud rate">
                <Select value={String(baud)} options={BAUDS.map((b) => ({ value: String(b), label: String(b) }))} onChange={(v) => setBaud(num(v))} />
              </Field>
              <Field label="Data bits">
                <Select value={String(dataBits)} options={[5, 6, 7, 8].map((b) => ({ value: String(b), label: String(b) }))} onChange={(v) => setDataBits(num(v))} />
              </Field>
              <Field label="Parity">
                <Select value={parity} options={['none', 'even', 'odd', 'mark', 'space'].map((p) => ({ value: p, label: p }))} onChange={setParity} />
              </Field>
              <Field label="Stop bits">
                <Select value={stopBits} options={['1', '1.5', '2'].map((p) => ({ value: p, label: p }))} onChange={setStopBits} />
              </Field>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost h-8 px-3" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={kind === 'serial' && !device}>
            Connect
          </button>
        </div>
      </form>
    </Modal>
  );
}
