import { useEffect, useState } from 'react';
import { Folder, Layers, RefreshCw, TriangleAlert } from 'lucide-react';
import { Modal } from '../ui/Dialogs';
import { Select } from '../ui/Select';
import { Field } from './ConnectDialog';
import type { StreamProfile, StreamSpec } from '../../types';
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

export interface StreamDialogState {
  kind: 'telnet' | 'serial';
  /** A saved connection to edit (with id), or defaults for a new one to save (folderId). */
  profile?: Partial<StreamProfile>;
}

interface Props {
  initial: StreamDialogState;
  folders: { id: string; label: string; depth: number }[];
  onClose: () => void;
  /** Connect without saving. */
  onConnect: (spec: StreamSpec) => void;
  /** Save to the host list, then connect if asked. */
  onSave: (p: StreamProfile, connect: boolean) => void;
}

/** Telnet and serial connections: a quick connection, or one saved in the host list. */
export function StreamDialog({ initial, folders, onClose, onConnect, onSave }: Props) {
  const editing = !!initial.profile?.id;
  // A saved profile's values win; a quick connection starts from the last one.
  const last: Partial<StreamSpec> = initial.profile ? initial.profile : remembered();
  const [kind, setKind] = useState<'telnet' | 'serial'>(initial.profile?.kind ?? initial.kind);
  const [host, setHost] = useState(last.host ?? '');
  const [port, setPort] = useState(last.port || 23);
  const [device, setDevice] = useState(last.device ?? '');
  const [baud, setBaud] = useState(last.baud || 115200);
  const [dataBits, setDataBits] = useState(last.dataBits || 8);
  const [parity, setParity] = useState(last.parity || 'none');
  const [stopBits, setStopBits] = useState(last.stopBits || '1');
  const [save, setSave] = useState(!!initial.profile);
  const [name, setName] = useState(initial.profile?.name ?? '');
  const [folderId, setFolderId] = useState(initial.profile?.folderId ?? '');
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

  // A saved port that isn't plugged in right now must still show.
  const portOptions = [...ports, ...(device && !ports.includes(device) ? [device] : [])].map((p) => ({
    value: p,
    label: ports.includes(p) ? p : `${p} (not connected)`,
  }));

  const spec = (): StreamSpec => ({ kind, host: host.trim(), port: Number(port) || 23, device: device.trim(), baud, dataBits, parity, stopBits });
  const defaultName = kind === 'telnet' ? host.trim() || 'host' : device || 'serial port';

  const submit = (connect: boolean) => {
    const s = spec();
    if (!save) {
      try {
        localStorage.setItem(KEY, JSON.stringify(s));
      } catch {
        // not remembered
      }
      onConnect(s);
      return;
    }
    onSave({ ...s, id: initial.profile?.id ?? crypto.randomUUID(), name: name.trim() || defaultName, folderId, sortOrder: initial.profile?.sortOrder ?? 0 }, connect);
  };

  const num = (v: string | number) => Number(v);
  const invalid = kind === 'serial' ? !device : !host.trim();

  return (
    <Modal
      title={editing ? 'Edit connection' : 'Telnet / serial'}
      subtitle={editing ? 'A saved Telnet or serial connection.' : 'Connect to a network device or a serial console.'}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(true);
        }}
        className="px-5 pb-5 pt-1 space-y-4"
      >
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
                  <Select value={device} options={portOptions} onChange={setDevice} placeholder="Select a port" />
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

        {!editing && (
          <label className="flex items-center gap-2 text-[12.5px] text-gray-300 cursor-pointer select-none">
            <input type="checkbox" className="accent-[rgb(var(--accent))] w-3.5 h-3.5" checked={save} onChange={(e) => setSave(e.target.checked)} />
            Save in the host list
          </label>
        )}
        {save && (
          <div className="grid grid-cols-2 gap-2 animate-fade-in">
            <Field label="Name">
              <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder={defaultName} />
            </Field>
            <Field label="Folder">
              <Select
                value={folderId}
                onChange={setFolderId}
                options={[
                  { value: '', label: 'Top level', icon: <Layers size={13} className="text-gray-500" /> },
                  ...folders.map((f) => ({ value: f.id, label: f.label, depth: f.depth, icon: <Folder size={13} className="text-gray-400" /> })),
                ]}
              />
            </Field>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost h-8 px-3" onClick={onClose}>
            Cancel
          </button>
          {save && (
            <button type="button" className="btn-secondary h-8 px-3" disabled={invalid} onClick={() => submit(false)}>
              Save
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={invalid}>
            {save ? 'Save & connect' : 'Connect'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
