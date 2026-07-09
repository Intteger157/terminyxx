import { useState } from 'react';
import type { RDPProfile } from '../../types';

interface RdpDialogProps {
  open: boolean;
  initial?: Partial<RDPProfile>;
  onClose: () => void;
  onSave: (profile: RDPProfile) => void;
}

export function RdpDialog({ open, initial, onClose, onSave }: RdpDialogProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [host, setHost] = useState(initial?.host ?? '');
  const [port, setPort] = useState(initial?.port ?? 3389);
  const [username, setUsername] = useState(initial?.username ?? '');
  const [domain, setDomain] = useState(initial?.domain ?? '');
  const [width, setWidth] = useState(initial?.width ?? 1920);
  const [height, setHeight] = useState(initial?.height ?? 1080);
  const [fullscreen, setFullscreen] = useState(initial?.fullscreen ?? false);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name: name || host,
      host,
      port: Number(port),
      username,
      domain,
      password: '',
      width: Number(width),
      height: Number(height),
      fullscreen,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface-raised border border-border rounded-lg w-full max-w-md shadow-xl">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">RDP Профиль</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <Field label="Название">
            <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Хост" className="col-span-2">
              <input className="input-field" value={host} onChange={(e) => setHost(e.target.value)} required />
            </Field>
            <Field label="Порт">
              <input className="input-field" type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} />
            </Field>
          </div>
          <Field label="Пользователь">
            <input className="input-field" value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>
          <Field label="Домен">
            <input className="input-field" value={domain} onChange={(e) => setDomain(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Ширина">
              <input className="input-field" type="number" value={width} onChange={(e) => setWidth(Number(e.target.value))} />
            </Field>
            <Field label="Высота">
              <input className="input-field" type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input type="checkbox" checked={fullscreen} onChange={(e) => setFullscreen(e.target.checked)} />
            Полноэкранный режим
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Отмена</button>
            <button type="submit" className="btn-primary">Сохранить</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}
