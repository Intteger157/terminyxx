import { useState } from 'react';
import type { SSHProfile } from '../../types';

interface ConnectDialogProps {
  open: boolean;
  initial?: Partial<SSHProfile>;
  onClose: () => void;
  onConnect: (profile: SSHProfile, save: boolean) => void;
}

export function ConnectDialog({ open, initial, onClose, onConnect }: ConnectDialogProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [host, setHost] = useState(initial?.host ?? '');
  const [port, setPort] = useState(initial?.port ?? 22);
  const [username, setUsername] = useState(initial?.username ?? '');
  const [authType, setAuthType] = useState<string>(initial?.authType ?? 'password');
  const [password, setPassword] = useState(initial?.password ?? '');
  const [keyPath, setKeyPath] = useState(initial?.keyPath ?? '');
  const [saveProfile, setSaveProfile] = useState(false);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const profile: SSHProfile = {
      id: initial?.id ?? crypto.randomUUID(),
      name: name || `${username}@${host}`,
      host,
      port: Number(port),
      username,
      authType,
      password,
      keyPath,
    };
    onConnect(profile, saveProfile);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface-raised border border-border rounded-lg w-full max-w-md shadow-xl">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">SSH Подключение</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <Field label="Название">
            <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Server" />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Хост" className="col-span-2">
              <input className="input-field" value={host} onChange={(e) => setHost(e.target.value)} required placeholder="192.168.1.1" />
            </Field>
            <Field label="Порт">
              <input className="input-field" type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} required />
            </Field>
          </div>
          <Field label="Пользователь">
            <input className="input-field" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </Field>
          <Field label="Аутентификация">
            <select className="input-field" value={authType} onChange={(e) => setAuthType(e.target.value)}>
              <option value="password">Пароль</option>
              <option value="key">SSH-ключ</option>
            </select>
          </Field>
          {authType === 'password' ? (
            <Field label="Пароль">
              <input className="input-field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          ) : (
            <Field label="Путь к ключу">
              <input className="input-field" value={keyPath} onChange={(e) => setKeyPath(e.target.value)} placeholder="~/.ssh/id_rsa" />
            </Field>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input type="checkbox" checked={saveProfile} onChange={(e) => setSaveProfile(e.target.checked)} />
            Сохранить профиль
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Отмена</button>
            <button type="submit" className="btn-primary">Подключить</button>
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
