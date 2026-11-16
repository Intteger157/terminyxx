import { useState } from 'react';
import type { RDPProfile } from '../../types';
import { Modal } from '../ui/Dialogs';
import { Field, Toggle } from '../terminal/ConnectDialog';

interface RdpDialogProps {
  initial?: Partial<RDPProfile>;
  onClose: () => void;
  onSave: (profile: RDPProfile) => void;
}

const RESOLUTIONS: [number, number][] = [
  [1280, 720],
  [1600, 900],
  [1920, 1080],
  [2560, 1440],
];

export function RdpDialog({ initial, onClose, onSave }: RdpDialogProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [host, setHost] = useState(initial?.host ?? '');
  const [port, setPort] = useState(initial?.port ?? 3389);
  const [username, setUsername] = useState(initial?.username ?? '');
  const [domain, setDomain] = useState(initial?.domain ?? '');
  const [width, setWidth] = useState(initial?.width ?? 1920);
  const [height, setHeight] = useState(initial?.height ?? 1080);
  const [fullscreen, setFullscreen] = useState(initial?.fullscreen ?? false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim() || host.trim(),
      host: host.trim(),
      port: Number(port) || 3389,
      username: username.trim(),
      domain: domain.trim(),
      password: '',
      width: Number(width),
      height: Number(height),
      fullscreen,
    });
  };

  return (
    <Modal title="RDP profile" subtitle="Opens in the system's Remote Desktop client." onClose={onClose}>
      <form onSubmit={handleSubmit} className="px-5 pb-5 pt-1 space-y-4">
        <div className="grid grid-cols-[1fr_88px] gap-2">
          <Field label="Host">
            <input className="input-field font-mono" value={host} onChange={(e) => setHost(e.target.value)} required autoFocus spellCheck={false} />
          </Field>
          <Field label="Port">
            <input className="input-field font-mono" type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Username">
            <input className="input-field" value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>
          <Field label="Domain">
            <input className="input-field" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="optional" />
          </Field>
        </div>
        <Field label="Name">
          <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder={host || 'Office PC'} />
        </Field>
        <div>
          <span className="label">Resolution</span>
          <div className="flex flex-wrap gap-1.5">
            {RESOLUTIONS.map(([w, h]) => {
              const active = !fullscreen && w === width && h === height;
              return (
                <button
                  key={w}
                  type="button"
                  disabled={fullscreen}
                  onClick={() => {
                    setWidth(w);
                    setHeight(h);
                  }}
                  className={`h-7 px-2.5 rounded-lg text-2xs font-mono transition-colors disabled:opacity-40 ${
                    active ? 'bg-accent/15 text-accent ring-1 ring-inset ring-accent/40' : 'bg-white/[0.04] text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {w}×{h}
                </button>
              );
            })}
          </div>
        </div>
        <Toggle checked={fullscreen} onChange={setFullscreen} label="Full screen" />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost h-8 px-3" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
