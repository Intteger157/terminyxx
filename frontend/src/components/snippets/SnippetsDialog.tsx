import { useEffect, useMemo, useState } from 'react';
import { Pencil, Play, Plus, Search, Trash2 } from 'lucide-react';
import { Modal, useDialogs } from '../ui/Dialogs';
import { Field, Toggle } from '../terminal/ConnectDialog';
import { fillSnippet, sendSnippet, snippetVars, type Snippet } from '../../lib/snippets';
import { DeleteSnippet, ListSnippets, SaveSnippet } from '../../../wailsjs/go/main/App';
import { store } from '../../../wailsjs/go/models';

interface Props {
  /** Pane that receives the snippet; null when no terminal is open. */
  paneId: string | null;
  /** Values for built-in variables such as {{host}} and {{user}}. */
  builtins: Record<string, string>;
  /** "Type in all panes" is on: the snippet goes to every pane of the tab. */
  broadcasting: boolean;
  onClose: () => void;
  /** Open straight on the run form for this snippet (used by the palette). */
  initialRun?: Snippet;
}

type View = { kind: 'list' } | { kind: 'edit'; snippet: Snippet } | { kind: 'run'; snippet: Snippet };

const blank = (): Snippet => ({ id: crypto.randomUUID(), name: '', command: '', description: '', group: '', execute: true, sortOrder: 0 });

export function SnippetsDialog({ paneId, builtins, broadcasting, onClose, initialRun }: Props) {
  const dialogs = useDialogs();
  const [items, setItems] = useState<Snippet[]>([]);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>(initialRun ? { kind: 'run', snippet: initialRun } : { kind: 'list' });

  const reload = () =>
    ListSnippets()
      .then((l) => setItems((l ?? []) as Snippet[]))
      .catch(() => setItems([]));
  useEffect(() => {
    void reload();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((s) => `${s.name} ${s.group} ${s.command} ${s.description}`.toLowerCase().includes(q)) : items;
  }, [items, query]);
  const groups = useMemo(() => {
    const m = new Map<string, Snippet[]>();
    for (const s of filtered) m.set(s.group, [...(m.get(s.group) ?? []), s]);
    return [...m.entries()];
  }, [filtered]);

  const run = async (s: Snippet, values: Record<string, string>) => {
    if (!paneId) return;
    await sendSnippet(paneId, fillSnippet(s.command, { ...builtins, ...values }), s.execute, true);
    onClose();
  };

  const start = (s: Snippet) => {
    if (!paneId) {
      dialogs.toast('Open a terminal first.', 'info');
      return;
    }
    const needsInput = snippetVars(s.command).some((v) => !(v.name in builtins));
    // Commands that only type (no Enter) are previewed first as well.
    if (!needsInput && s.execute) void run(s, {});
    else setView({ kind: 'run', snippet: s });
  };

  const save = async (s: Snippet) => {
    try {
      await SaveSnippet(store.Snippet.createFrom(s));
      await reload();
      setView({ kind: 'list' });
    } catch (e) {
      dialogs.toast(String(e).replace(/^Error: /, ''), 'error');
    }
  };

  const remove = async (s: Snippet) => {
    if (!(await dialogs.confirm({ title: 'Delete snippet?', message: s.name, confirmLabel: 'Delete', danger: true }))) return;
    await DeleteSnippet(s.id).catch(() => {});
    await reload();
  };

  if (view.kind === 'run') {
    return (
      <RunForm
        snippet={view.snippet}
        builtins={builtins}
        broadcasting={broadcasting}
        onBack={() => (initialRun ? onClose() : setView({ kind: 'list' }))}
        onClose={onClose}
        onRun={(v) => void run(view.snippet, v)}
      />
    );
  }
  if (view.kind === 'edit') {
    return <EditForm snippet={view.snippet} groups={groups.map(([g]) => g).filter(Boolean)} onClose={onClose} onBack={() => setView({ kind: 'list' })} onSave={(s) => void save(s)} />;
  }

  return (
    <Modal title="Snippets" subtitle="Saved commands. Use {{name}} for values asked when you run them." onClose={onClose} width="max-w-lg">
      <div className="px-5 pb-5 pt-1 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
            <input className="input-field pl-8" placeholder="Search snippets" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          </div>
          <button className="btn-primary inline-flex items-center gap-1" onClick={() => setView({ kind: 'edit', snippet: blank() })}>
            <Plus size={13} /> New
          </button>
        </div>
        {broadcasting && <p className="text-2xs text-amber-300/90">Typing in all panes is on: snippets go to every pane of this tab.</p>}
        {items.length === 0 && <p className="py-6 text-center text-[12.5px] text-gray-500">No snippets yet. Create one for commands you type often.</p>}
        <div className="space-y-3 max-h-[50vh] overflow-y-auto">
          {groups.map(([group, list]) => (
            <div key={group}>
              {group && <div className="mb-1 px-1 text-2xs uppercase tracking-wide text-gray-600">{group}</div>}
              {list.map((s) => (
                <div key={s.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.04]">
                  <button className="flex-1 min-w-0 text-left" onClick={() => start(s)} title="Run in the active terminal">
                    <div className="text-[12.5px] text-gray-200 truncate">{s.name}</div>
                    <div className="font-mono text-2xs text-gray-500 truncate">{s.command.split('\n')[0]}</div>
                  </button>
                  <button className="icon-btn opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`Edit ${s.name}`} onClick={() => setView({ kind: 'edit', snippet: s })}>
                    <Pencil size={13} />
                  </button>
                  <button className="icon-btn opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`Delete ${s.name}`} onClick={() => void remove(s)}>
                    <Trash2 size={13} />
                  </button>
                  <button className="icon-btn text-accent" aria-label={`Run ${s.name}`} onClick={() => start(s)}>
                    <Play size={13} />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function EditForm({ snippet, groups, onClose, onBack, onSave }: { snippet: Snippet; groups: string[]; onClose: () => void; onBack: () => void; onSave: (s: Snippet) => void }) {
  const [s, setS] = useState(snippet);
  const set = (patch: Partial<Snippet>) => setS((cur) => ({ ...cur, ...patch }));
  return (
    <Modal title={snippet.name ? 'Edit snippet' : 'New snippet'} onClose={onClose} width="max-w-lg">
      <form
        className="px-5 pb-5 pt-1 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...s, name: s.name.trim(), group: s.group.trim() });
        }}
      >
        <div className="grid grid-cols-[1fr_160px] gap-2">
          <Field label="Name">
            <input className="input-field" value={s.name} onChange={(e) => set({ name: e.target.value })} required autoFocus />
          </Field>
          <Field label="Group">
            <input className="input-field" list="snippet-groups" value={s.group} onChange={(e) => set({ group: e.target.value })} placeholder="optional" />
            <datalist id="snippet-groups">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </Field>
        </div>
        <Field label="Command" hint="One or more lines. Placeholders: {{name}}, {{name:default}}. Built in: {{host}}, {{user}}.">
          <textarea className="input-field font-mono min-h-[110px] py-2" value={s.command} onChange={(e) => set({ command: e.target.value })} required spellCheck={false} />
        </Field>
        <Field label="Description">
          <input className="input-field" value={s.description} onChange={(e) => set({ description: e.target.value })} placeholder="optional" />
        </Field>
        <Toggle checked={s.execute} onChange={(v) => set({ execute: v })} label="Press Enter after typing" />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost h-8 px-3" onClick={onBack}>
            Back
          </button>
          <button type="submit" className="btn-primary">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RunForm({
  snippet,
  builtins,
  broadcasting,
  onBack,
  onClose,
  onRun,
}: {
  snippet: Snippet;
  builtins: Record<string, string>;
  broadcasting: boolean;
  onBack: () => void;
  onClose: () => void;
  onRun: (v: Record<string, string>) => void;
}) {
  const vars = snippetVars(snippet.command).filter((v) => !(v.name in builtins));
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(vars.map((v) => [v.name, v.default])));
  const preview = fillSnippet(snippet.command, { ...builtins, ...values });
  return (
    <Modal title={snippet.name} subtitle={broadcasting ? 'Will be typed in all panes of this tab.' : undefined} onClose={onClose} width="max-w-lg">
      <form
        className="px-5 pb-5 pt-1 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onRun(values);
        }}
      >
        {vars.map((v, i) => (
          <Field key={v.name} label={v.name}>
            <input className="input-field font-mono" value={values[v.name] ?? ''} onChange={(e) => setValues((cur) => ({ ...cur, [v.name]: e.target.value }))} autoFocus={i === 0} spellCheck={false} />
          </Field>
        ))}
        <div>
          <span className="label">Will {snippet.execute ? 'run' : 'type'}</span>
          <pre className="rounded-lg bg-black/30 p-2.5 font-mono text-2xs text-gray-300 whitespace-pre-wrap break-all max-h-40 overflow-auto">{preview}</pre>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost h-8 px-3" onClick={onBack}>
            Back
          </button>
          <button type="submit" className="btn-primary" autoFocus={vars.length === 0}>
            {snippet.execute ? 'Run' : 'Insert'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
