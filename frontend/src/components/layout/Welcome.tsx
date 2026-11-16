import { useState } from 'react';
import { ArrowRight, Plus, TerminalSquare } from 'lucide-react';
import type { SSHProfile } from '../../types';
import { Avatar } from '../ui/Avatar';
import { modKey, parseQuickTarget } from '../../lib/hosts';
import type { Platform, QuickTarget } from '../../lib/hosts';

interface WelcomeProps {
  platform: Platform;
  profiles: SSHProfile[];
  onConnect: (profile: SSHProfile) => void;
  onQuickConnect: (target: QuickTarget) => void;
  onNew: () => void;
}

export function Welcome({ platform, profiles, onConnect, onQuickConnect, onNew }: WelcomeProps) {
  const [value, setValue] = useState('');
  const target = parseQuickTarget(value);
  const mod = modKey(platform);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const match = profiles.find((p) => p.name.toLowerCase() === value.trim().toLowerCase());
    if (match) onConnect(match);
    else if (target) onQuickConnect(target);
    else onNew();
  };

  return (
    <div className="relative h-full overflow-y-auto">
      {/* soft accent glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[720px] h-[420px] rounded-full bg-accent/[0.09] blur-3xl" />

      <div className="relative max-w-2xl mx-auto px-8 pt-[12vh] pb-12 animate-slide-up">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-accent to-fuchsia-500 flex items-center justify-center shadow-[0_8px_32px_-8px_rgb(var(--accent)/0.8)]">
            <TerminalSquare size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-gray-100">Terminyxx</h1>
            <p className="text-gray-500">Connect to a server to get started.</p>
          </div>
        </div>

        <form onSubmit={submit} className="relative group">
          <input
            className="w-full h-12 pl-4 pr-28 rounded-xl bg-surface border border-border text-[14px] text-gray-100 placeholder-gray-500 font-mono shadow-[0_1px_0_rgb(255_255_255/0.03)_inset] transition-all focus:outline-none focus:border-accent/60 focus:ring-4 focus:ring-accent/15"
            placeholder="user@host:port"
            value={value}
            autoFocus
            spellCheck={false}
            onChange={(e) => setValue(e.target.value)}
          />
          <button type="submit" className="btn-primary absolute right-1.5 top-1.5 h-9">
            Connect <ArrowRight size={14} />
          </button>
        </form>
        <p className="mt-2 text-2xs text-gray-600 h-4">
          {target
            ? `SSH to ${target.username ? target.username + '@' : ''}${target.host} on port ${target.port}`
            : 'Type an address like root@10.0.0.5 or deploy@example.com:2222'}
        </p>

        <div className="mt-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="label mb-0">Saved hosts</h2>
            <button className="btn-ghost text-2xs" onClick={onNew}>
              <Plus size={12} /> New host
            </button>
          </div>
          {profiles.length === 0 ? (
            <button
              onClick={onNew}
              className="w-full card border-dashed px-5 py-8 text-center text-gray-500 hover:text-gray-300 hover:border-border-strong transition-colors"
            >
              Saved hosts appear here. Add your first one.
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {profiles.slice(0, 8).map((p) => (
                <button
                  key={p.id}
                  onClick={() => onConnect(p)}
                  className="group card flex items-center gap-3 px-3 py-2.5 text-left hover:border-border-strong hover:bg-surface-raised transition-all"
                >
                  <Avatar label={p.name} colorKey={p.id} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-gray-200 truncate">{p.name}</span>
                    <span className="block text-2xs text-gray-500 truncate font-mono">
                      {p.username}@{p.host}
                    </span>
                  </span>
                  <ArrowRight size={14} className="text-gray-600 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-10 grid grid-cols-3 gap-2 text-2xs text-gray-500">
          {[
            ['Command palette', [mod, '⇧', 'P']],
            ['New connection', [mod, '⇧', 'T']],
            ['Toggle SFTP', [mod, '⇧', 'F']],
          ].map(([label, keys]) => (
            <div key={label as string} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
              <span>{label}</span>
              <span className="flex gap-0.5">
                {(keys as string[]).map((k) => (
                  <span key={k} className="kbd">
                    {k}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
